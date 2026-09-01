import { createHash } from "node:crypto";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent, type IdempotentResult } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { HttpError } from "@/lib/http/response";
import {
  quoteRequestBodySchema,
  requestQuoteViaCapabilityApi,
} from "@/features/routes/quote-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResult(error: HttpError): IdempotentResult {
  return {
    status: error.status,
    body: {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    },
  };
}

/**
 * Public agent quote request. x402 flow:
 *   POST (no X-PAYMENT)     → 402 PAYMENT_REQUIRED with `details.accepts` (paid route)
 *   POST + X-PAYMENT        → official verify → settle → 200 + `X-PAYMENT-RESPONSE`
 *   bad authorisation       → 402 PAYMENT_FAILED (immutable FAILED receipt kept)
 *   facilitator unreachable → 503 PAYMENT_SERVICE_UNAVAILABLE (retryable)
 *   settle outcome unknown  → 503 PAYMENT_SETTLEMENT_INDETERMINATE (do NOT re-authorise)
 * Non-payment outcomes: 202 (free route), 409 ROUTE_UNAVAILABLE, 422, 503, 404.
 * A settlement, X-PAYMENT verification, receipt, or tx hash is never fabricated.
 */
export const POST = route(async (request, context) => {
  const { businessSlug, routeSlug } = await context.params;
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, quoteRequestBodySchema);
  const db = await getDb();

  const url = new URL(request.url);
  const xPaymentHeader = request.headers.get("x-payment");
  // The X-PAYMENT header is part of the idempotent IDENTITY, folded into the
  // scope (not the payload): an unpaid probe and its paid retry under the SAME
  // Idempotency-Key are distinct records that each replay cleanly — the natural
  // x402 retry pattern, rather than a 409 conflict.
  const xPaymentHash = xPaymentHeader
    ? createHash("sha256").update(xPaymentHeader).digest("hex")
    : null;
  const scope = xPaymentHash
    ? `v1.quote:${businessSlug}:${routeSlug}:pay:${xPaymentHash}`
    : `v1.quote:${businessSlug}:${routeSlug}:probe`;

  return runIdempotent(
    db,
    scope,
    key,
    body,
    async () => {
      try {
        const outcome = await requestQuoteViaCapabilityApi(db, businessSlug, routeSlug, body, {
          xPaymentHeader,
          resourceUrl: `${url.origin}/v1/${businessSlug}/${routeSlug}/quote`,
        });
        const result: IdempotentResult = {
          status: outcome.httpStatus,
          body: { success: true, data: outcome.body },
        };
        if (outcome.kind === "SETTLED" && outcome.responseHeader) {
          result.headers = { [outcome.responseHeader.name]: outcome.responseHeader.value };
        }
        return result;
      } catch (error) {
        if (error instanceof HttpError) return errorResult(error);
        throw error;
      }
    },
    { cacheErrors: true },
  );
});
