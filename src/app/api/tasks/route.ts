import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { createTask, createTaskRequestSchema } from "@/features/tasks/service";
import { listBuyerWork } from "@/features/tasks/work";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The buyer's active work, grouped — for the home / workspace (§1, §2). */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();
  return ok(await listBuyerWork(db, sessionId));
});

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
