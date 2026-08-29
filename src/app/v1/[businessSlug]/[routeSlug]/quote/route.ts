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
 * Public, agent-facing quote request. Structured outcomes:
 *  - 202 AWAITING_QUOTE            valid request on a free route
 *  - 409 ROUTE_UNAVAILABLE        paused / unverified / stale route — no payment requested
 *  - 422 VALIDATION_FAILED        field-level input errors
 *  - 503 PAYMENT_SERVICE_UNAVAILABLE  paid route, no x402/cPay facilitator — Task still created
 * A 402 settlement, X-PAYMENT verification, receipt, or tx hash is never fabricated (ADR-004).
 */
export const POST = route(async (request, context) => {
  const { businessSlug, routeSlug } = await context.params;
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, quoteRequestBodySchema);
  const db = await getDb();

  return runIdempotent(
    db,
    `v1.quote:${businessSlug}:${routeSlug}`,
    key,
    body,
    async () => {
      try {
        const accepted = await requestQuoteViaCapabilityApi(db, businessSlug, routeSlug, body);
        return { status: 202, body: { success: true, data: accepted } };
      } catch (error) {
        if (error instanceof HttpError) return errorResult(error);
        throw error;
      }
    },
    { cacheErrors: true },
  );
});
