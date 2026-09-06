import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { changeDecisionSchema, decideOnPriceChange } from "@/features/quotes/revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer decides on a price change the business proposed after they had
 * already agreed a price.
 *
 *   { "decision": "ACCEPT"  } → the new amount takes effect; the previously
 *                              agreed row is closed as superseded, never edited.
 *   { "decision": "DECLINE" } → the originally agreed terms stand untouched.
 *
 * This is the only way a different amount can ever take effect on an agreed
 * order. Requires the order's own session, like every other buyer decision.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, changeDecisionSchema);
  const db = await getDb();

  return runIdempotent(
    db,
    `tasks.price_change:${id}`,
    key,
    { id, sessionId, ...body },
    async () => {
      const result = await decideOnPriceChange(db, id, sessionId, body);
      return { status: 200, body: { success: true, data: result } };
    },
  );
});
