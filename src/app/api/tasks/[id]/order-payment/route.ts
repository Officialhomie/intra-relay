import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { requireIdempotencyKey, requireSessionId } from "@/lib/http/request";
import { runIdempotent } from "@/lib/http/idempotency";
import { createOrderPaymentIntent } from "@/features/payments/order/intent";
import { toPublicOrderPayment } from "@/features/payments/order/service";
import { resumeOrderPaymentVerification } from "@/features/payments/order/controller";
import { taskBelongsToSession } from "@/features/tasks/ownership";
import { findTaskById } from "@/features/tasks/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start (or resume) the buyer's order payment via MiniPay (M10.5, ADR-023).
 *
 * The server resolves the recipient, amount and asset from the accepted
 * commitment — the request body carries nothing (§8, §9). Idempotent: a repeat
 * within the payment window returns the same intent.
 *
 * Headers: `x-session-id` (the task's own session), `Idempotency-Key`.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const key = requireIdempotencyKey(request);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  return runIdempotent(db, `order-payment.create:${id}`, key, { id, sessionId }, async () => {
    const row = await createOrderPaymentIntent(db, id, sessionId);
    return { status: 201, body: { success: true, data: toPublicOrderPayment(row) } };
  });
});

/** Poll the current payment state (also nudges verification for anything in flight). */
export const GET = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  const task = await findTaskById(db, id);
  if (!task || !taskBelongsToSession(task, sessionId)) {
    return ok({ status: null, offered: false, paid: false });
  }
  const row = await resumeOrderPaymentVerification(db, id);
  return ok(row ? toPublicOrderPayment(row) : { status: null, offered: false, paid: false });
});
