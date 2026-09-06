import { route } from "@/lib/http/handler";
import { requireSessionId } from "@/lib/http/request";
import { HttpError, ok } from "@/lib/http/response";
import { getAgentRunForSession } from "@/features/agent/run/service";
import { toAgentRunView } from "@/features/agent/run/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a run. Returns its status, the growing trace, and the recommendation once ready. */
export const GET = route(async (request, context) => {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);

  const { run, forbidden } = getAgentRunForSession(runId, sessionId);
  if (forbidden) {
    throw new HttpError(403, "NOT_YOUR_RUN", "This run belongs to another device.");
  }
  if (!run) {
    throw new HttpError(
      404,
      "RUN_NOT_FOUND",
      "No such run. Runs are not saved and are dropped after 30 minutes — start a new one.",
    );
  }

  return ok(toAgentRunView(run));
});
