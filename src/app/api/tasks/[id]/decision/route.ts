import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { decideOnQuote, decideOnQuoteRequestSchema } from "@/features/tasks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer accepts or declines the quote in front of them (PRD §8).
 *
 *   { "decision": "ACCEPT" }              → task HANDOFF_READY, WhatsApp message revealed
 *   { "decision": "DECLINE", "reason"? }  → task CANCELLED
 *
 * Requires `x-session-id` (the task's own session) and `Idempotency-Key`.
 * Intra never sends the message or places the order.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, decideOnQuoteRequestSchema);
  const db = await getDb();

  return runIdempotent(db, `tasks.decision:${id}`, key, { id, sessionId, ...body }, async () => {
    const result = await decideOnQuote(db, id, sessionId, body);
    return { status: 200, body: { success: true, data: result } };
  });
});
