import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { confirmHandoff } from "@/features/tasks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer confirms they have sent the pre-filled message to the printer.
 * Records a content-free `task.handoff_confirmed` audit event and unlocks the
 * post-handoff feedback form. Idempotent.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  return runIdempotent(db, `tasks.handoffConfirm:${id}`, key, { id, sessionId }, async () => {
    const result = await confirmHandoff(db, id, sessionId);
    return { status: 200, body: { success: true, data: result } };
  });
});
