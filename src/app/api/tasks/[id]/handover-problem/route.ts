import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { handoverProblemSchema, reportHandoverFailure } from "@/features/tasks/exception-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer reports that the pickup / handover did not go through (milestone 6
 * §18). The order is not marked complete and no completion record is written —
 * the buyer and the business re-coordinate directly.
 *
 * Requires the order's own session (or the buyer claim, §17).
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, handoverProblemSchema);
  const db = await getDb();

  return runIdempotent(
    db,
    `tasks.handover_problem:${id}`,
    key,
    { id, sessionId, ...body },
    async () => {
      const result = await reportHandoverFailure(db, id, sessionId, body);
      return { status: 200, body: { success: true, data: result } };
    },
  );
});
