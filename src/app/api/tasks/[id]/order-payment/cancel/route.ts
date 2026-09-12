import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { requireSessionId } from "@/lib/http/request";
import { cancelOrderPayment } from "@/features/payments/order/controller";
import { toPublicOrderPayment } from "@/features/payments/order/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buyer dismissed the wallet without paying (M10.5 §21). The order itself is
 * untouched — only the payment intent moves to CANCELLED. No idempotency key
 * needed: it is safe to call repeatedly. Header: `x-session-id`.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sessionId = requireSessionId(request, url);
  const db = await getDb();

  const row = await cancelOrderPayment(db, id, sessionId);
  return ok(toPublicOrderPayment(row));
});
