import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow, ServicePaymentRow, TaskRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";

import { facilitatorConfigured } from "./lifecycle";
import { insertServicePayment, listPaymentsByTask } from "./repository";

export { assertSettlement } from "./lifecycle";

/**
 * Record the agent service-payment intent for a task.
 *
 * With no configured x402 facilitator this is `UNAVAILABLE` — never a fabricated
 * settlement (FR-PAY-004, ADR-004). Real 402/authorise/settle handling arrives
 * with the payment phase and official credentials.
 */
export async function recordServicePaymentIntent(
  db: Database,
  task: TaskRow,
  route: QuoteRouteRow,
): Promise<ServicePaymentRow> {
  const existing = await listPaymentsByTask(db, task.id);
  if (existing.length > 0) return existing[0];

  const configured = facilitatorConfigured();
  const payment = await insertServicePayment(db, {
    taskId: task.id,
    service: "quote-route",
    resource: route.endpoint,
    maxFeeUsd: route.queryFeeUsd,
    payee: route.payoutAddress,
    status: configured ? "NOT_REQUIRED" : "UNAVAILABLE",
  });

  await appendAuditEvent(db, {
    type: configured ? "payment.pending" : "payment.unavailable",
    taskId: task.id,
    routeId: route.id,
    paymentId: payment.id,
    data: { status: payment.status, maxFeeUsd: payment.maxFeeUsd },
  });

  return payment;
}
