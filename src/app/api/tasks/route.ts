import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { createTask, createTaskRequestSchema } from "@/features/tasks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, createTaskRequestSchema);
  const db = await getDb();

  return runIdempotent(db, `tasks.create:${sessionId}`, key, body, async () => {
    const task = await createTask(db, sessionId, body);
    return { status: 201, body: { success: true, data: task } };
  });
});
