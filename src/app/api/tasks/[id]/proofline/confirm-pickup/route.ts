import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { confirmPickup, confirmPickupRequestSchema } from "@/features/proofline/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proofline pilot — event 2. The buyer confirms they collected the order, either
 * from their own task session (`x-session-id`) or by entering the one-time
 * pickup code the merchant gave them (`{ "code": "ABC123" }`).
 *
 * Headers: `Idempotency-Key`, and `x-session-id` for the signed-in path.
 * `409 NOT_READY_FOR_PICKUP` if the merchant has not marked it ready first.
 * Operational evidence only — not a payment or a proof.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId =
    request.headers.get("x-session-id")?.trim() ||
    url.searchParams.get("sessionId")?.trim() ||
    null;
  const body = await parseJsonBody(request, confirmPickupRequestSchema);
  const db = await getDb();

  return runIdempotent(
    db,
    `proofline.confirmPickup:${id}`,
    key,
    { id, sessionId, code: body.code ?? null },
    async () => {
      const result = await confirmPickup(db, id, { sessionId, code: body.code });
      return { status: 201, body: { success: true, data: result } };
    },
  );
});
