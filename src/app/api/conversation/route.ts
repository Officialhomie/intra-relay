import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody, requireSessionId } from "@/lib/http/request";
import { HttpError, ok } from "@/lib/http/response";
import { recordPilotEvent } from "@/features/analytics/pilot";
import { handleConversationTurn, resetConversation } from "@/features/intent/conversation";
import { getConversation } from "@/features/intent/memory";
import { startAgentRun } from "@/features/agent/run/service";
import { toAgentRunView } from "@/features/agent/run/view";
import { listSessionTasksInStates } from "@/features/tasks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One turn of the natural conversation (milestone 6; milestone 7 §6–§9).
 *
 * The person types something; the layer reads what they want, replies in plain
 * language, and — only when there is genuine, complete commercial intent —
 * hands the request AND the brief it has accumulated across the whole
 * conversation to the existing buyer-agent run. It never accepts a quote,
 * moves money, or marks a job done: those stay on the deterministic order
 * surface, which re-checks every rule regardless of what was said here
 * (CLAUDE.md §4.3, milestone 6 §6, §31).
 *
 * `{ reset: true }` forgets this session's conversation so the person can start
 * a new request. It cannot affect their existing orders.
 */

const GREETING =
  "New request. Tell me what you need and I'll find a business on Intra that can do it, get you a real price, and let you decide.";

const bodySchema = z
  .object({
    message: z.string().trim().max(2000).optional(),
    /** "assisted" uses the LLM layer for the run; falls back to deterministic. */
    mode: z.enum(["assisted", "deterministic"]).optional(),
    reset: z.boolean().optional(),
  })
  .refine((v) => v.reset === true || (v.message != null && v.message.length >= 1), {
    message: "Say what you need.",
    path: ["message"],
  });

const OPEN_TRANSACTION_STATES = ["RECOMMENDED"] as const;

export const POST = route(async (request) => {
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, bodySchema);

  if (body.reset) {
    resetConversation(sessionId);
    return ok({ reset: true, message: GREETING });
  }
  const message = body.message;
  if (!message) throw new HttpError(422, "MESSAGE_REQUIRED", "Say what you need.");

  const db = await getDb();
  const openTasks = await listSessionTasksInStates(db, sessionId, OPEN_TRANSACTION_STATES);

  const firstTurn = getConversation(sessionId) === null;
  const reply = handleConversationTurn({
    sessionId,
    message,
    hasOpenTransaction: openTasks.length > 0,
  });
  if (firstTurn) {
    void recordPilotEvent(db, { name: "conversation_started", actorKey: sessionId });
  }

  // Genuine, complete commercial intent — start the real run, seeded with the
  // brief the conversation accumulated so the agent uses the person's own
  // values rather than re-reading only the last message.
  if (reply.action.kind === "START_RUN") {
    const run = startAgentRun({
      request: reply.action.request ?? message,
      briefCorrection: reply.action.brief,
      buyerSessionId: sessionId,
      origin: url.origin,
      mode: body.mode,
    });
    void recordPilotEvent(db, {
      name: "conversation_run_started",
      actorKey: sessionId,
      props: { category: reply.action.category ?? null },
    });
    return ok(
      {
        ...reply,
        run: toAgentRunView(run),
      },
      202,
    );
  }

  return ok({
    ...reply,
    openOrderIds: openTasks.map((task) => task.id),
  });
});
