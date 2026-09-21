import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody, requireSessionId } from "@/lib/http/request";
import { HttpError, ok } from "@/lib/http/response";
import { resetConversation } from "@/features/intent/conversation";
import { handleInboundMessage } from "@/features/conversation/gateway";
import { normalizeWebInbound } from "@/features/conversation/web-adapter";

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
    /** Stable per send/retry. Older Web clients may omit it; the adapter then
     * assigns one so behavior remains backward compatible. */
    messageId: z.string().trim().min(1).max(200).optional(),
    /** "assisted" uses the LLM layer for the run; falls back to deterministic. */
    mode: z.enum(["assisted", "deterministic"]).optional(),
    reset: z.boolean().optional(),
  })
  .refine((v) => v.reset === true || (v.message != null && v.message.length >= 1), {
    message: "Say what you need.",
    path: ["message"],
  });

export const POST = route(async (request) => {
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, bodySchema);

  const db = await getDb();

  if (body.reset) {
    await resetConversation(db, sessionId);
    return ok({ reset: true, message: GREETING });
  }
  const message = body.message;
  if (!message) throw new HttpError(422, "MESSAGE_REQUIRED", "Say what you need.");

  const gateway = await handleInboundMessage(
    db,
    normalizeWebInbound({
      sessionId,
      messageId: body.messageId ?? request.headers.get("idempotency-key")?.trim() ?? randomUUID(),
      text: message,
    }),
    { origin: url.origin, mode: body.mode },
  );
  const result = gateway.result;
  if (!result.reply) {
    throw new HttpError(
      500,
      "WEB_CONVERSATION_RESULT_INVALID",
      "The conversation result was invalid.",
    );
  }
  const data = {
    ...result.reply,
    ...(result.run ? { run: result.run } : { openOrderIds: result.openOrderIds ?? [] }),
    conversationId: result.conversationId,
    replayed: gateway.replayed,
  };
  return ok(data, result.run ? 202 : 200);
});
