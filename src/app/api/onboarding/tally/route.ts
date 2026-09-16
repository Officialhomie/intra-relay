import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { HttpError, ok } from "@/lib/http/response";
import { verifyTallySignature } from "@/features/onboarding/signature";
import { tallyWebhookPayloadSchema } from "@/features/onboarding/tally-schema";
import { processTallySubmission } from "@/features/onboarding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives one Tally `FORM_RESPONSE` webhook delivery for the printing
 * onboarding form (M10.1, ADR-024). It is one of the application's explicitly
 * signed webhook boundaries — never trust an unsigned request to it.
 *
 * `TALLY_SIGNING_SECRET` / `TALLY_FORM_ID` are both server-only and required;
 * with either unset this endpoint fails closed (`503`), never falling back
 * to accepting an unverified payload.
 */
export const POST = route(async (request) => {
  const secret = process.env.TALLY_SIGNING_SECRET;
  const expectedFormId = process.env.TALLY_FORM_ID;
  if (!secret || !expectedFormId) {
    throw new HttpError(
      503,
      "ONBOARDING_WEBHOOK_UNCONFIGURED",
      "TALLY_SIGNING_SECRET / TALLY_FORM_ID are not set.",
    );
  }

  // Signature is computed over the RAW body — read text before any parsing,
  // and never re-serialize a parsed object to check it (that can silently
  // diverge in key order/whitespace from what was actually signed).
  const rawBody = await request.text();
  const signature = request.headers.get("tally-signature");
  if (!verifyTallySignature(rawBody, signature, secret)) {
    throw new HttpError(401, "INVALID_SIGNATURE", "Tally-Signature did not verify.");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Webhook body must be valid JSON.");
  }

  const parsed = tallyWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "INVALID_WEBHOOK_PAYLOAD",
      "Unrecognized Tally webhook shape.",
      parsed.error.flatten(),
    );
  }

  const db = await getDb();
  const result = await processTallySubmission(db, parsed.data, expectedFormId);

  return ok({
    status: result.status,
    submissionId: result.submissionId,
    businessId: result.business?.id ?? null,
    routeId: result.route?.id ?? null,
  });
});
