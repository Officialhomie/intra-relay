import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { buyerCancelSchema, buyerCancelsAfterAgreement } from "@/features/tasks/exception-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer cancels an order they had already agreed (milestone 6 §18).
 *
 * Distinct from declining a recommendation — that goes through
 * `/api/tasks/:id/decision` before the order is agreed. This closes an agreed
 * order; Intra held no money, so nothing is refunded or charged here.
 *
 * Requires the order's own session (or the buyer claim, §17) and an
 * Idempotency-Key.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, buyerCancelSchema);
  const db = await getDb();

  return runIdempotent(db, `tasks.cancel:${id}`, key, { id, sessionId, ...body }, async () => {
    const result = await buyerCancelsAfterAgreement(db, id, sessionId, body);
    return { status: 200, body: { success: true, data: result } };
  });
});
