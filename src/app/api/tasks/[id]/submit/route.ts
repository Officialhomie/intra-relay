import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { submitTask } from "@/features/tasks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  return runIdempotent(db, `tasks.submit:${id}`, key, { id, sessionId }, async () => {
    const task = await submitTask(db, id, sessionId);
    return { status: 200, body: { success: true, data: task } };
  });
});
