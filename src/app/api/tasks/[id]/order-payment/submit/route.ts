import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody, requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { runIdempotent } from "@/lib/http/idempotency";
import { recordSubmittedOrderPayment } from "@/features/payments/order/controller";
import { toPublicOrderPayment } from "@/features/payments/order/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** The tx hash the buyer's wallet returned. Verified against the chain server-side. */
  txHash: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a transaction hash."),
});

/**
 * The buyer's wallet submitted a transaction (M10.5 §17). This records the hash
 * and kicks off server-side verification — it does NOT mark the payment
 * complete. Idempotent on the hash. Headers: `x-session-id`, `Idempotency-Key`.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const body = await parseJsonBody(request, bodySchema);
  const db = await getDb();

  return runIdempotent(
    db,
    `order-payment.submit:${id}`,
    key,
    { id, sessionId, txHash: body.txHash },
    async () => {
      const row = await recordSubmittedOrderPayment(db, id, sessionId, { txHash: body.txHash });
      return { status: 200, body: { success: true, data: toPublicOrderPayment(row) } };
    },
  );
});
