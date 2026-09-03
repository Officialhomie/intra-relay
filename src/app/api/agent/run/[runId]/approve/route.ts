import { z } from "zod";

import { route } from "@/lib/http/handler";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { HttpError, ok } from "@/lib/http/response";
import { approveAgentRun } from "@/features/agent/run/service";
import { toAgentRunView } from "@/features/agent/run/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const approveSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().max(500).optional(),
  /** Must equal the fingerprint on the recommendation the human was shown. */
  offerFingerprint: z.string().trim().min(1),
});

/**
 * The human decision. This is the ONLY path past a recommendation.
 *
 *   { "decision": "ACCEPT",  "offerFingerprint": "..." }  → records the buyer's
 *        acceptance, then attests the commitment (idempotent).
 *   { "decision": "DECLINE", "offerFingerprint": "..." }  → records the decline.
 *
 * The model never reaches this endpoint. `offerFingerprint` binds the decision
 * to the exact offer shown; a stale fingerprint is refused (approval.ts).
 */
export const POST = route(async (request, context) => {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  requireIdempotencyKey(request);
  const body = await parseJsonBody(request, approveSchema);

  const outcome = await approveAgentRun({
    runId,
    buyerSessionId: sessionId,
    decision: body.decision,
    reason: body.reason,
    offerFingerprint: body.offerFingerprint,
  });

  if (!outcome.ok) {
    throw new HttpError(outcome.status, outcome.code, outcome.message);
  }

  return ok(toAgentRunView(outcome.run));
});
