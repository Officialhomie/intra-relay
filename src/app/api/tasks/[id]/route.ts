import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireSessionId } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { getTaskView } from "@/features/tasks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  const view = await getTaskView(db, id, sessionId);
  return ok(view);
});
