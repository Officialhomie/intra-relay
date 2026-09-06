import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken } from "@/lib/http/operator";
import { requireIdempotencyKey } from "@/lib/http/request";
import { markReadyForPickup } from "@/features/proofline/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proofline pilot — event 1. The merchant records that the job is ready for
 * pickup. Headers: `x-manage-token` (the route's manage token) + `Idempotency-Key`.
 *
 * Operational evidence only — this is not a payment, a settlement, or a proof.
 * Requires the buyer to have already handed off the order
 * (`409 HANDOFF_NOT_CONFIRMED` otherwise).
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);
  const manageToken = getManageToken(request);
  const db = await getDb();

  return runIdempotent(db, `proofline.ready:${id}`, key, { id }, async () => {
    const result = await markReadyForPickup(db, id, { manageToken });
    return { status: 201, body: { success: true, data: result } };
  });
});
