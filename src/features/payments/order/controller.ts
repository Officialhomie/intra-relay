/**
 * The deterministic order-payment controller — submission & cancellation
 * (M10.5, ADR-023). Not a model tool. The buyer's only input here is a tx hash;
 * everything else was frozen at intent creation.
 */
import { after } from "next/server";

import type { Database } from "@/lib/db/client";
import type { OrderPaymentRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { taskBelongsToSession } from "@/features/tasks/ownership";
import { findTaskById } from "@/features/tasks/repository";
import { forwardServerAnalyticsEvent } from "@/features/analytics/server";

import {
  findLatestOrderPaymentByTaskId,
  findOrderPaymentByTxHash,
  updateOrderPayment,
} from "./repository";
import { isOrderPaymentTerminal } from "./status";
import { verifyOrderPayment, type ReceiptClient } from "./verify";
import type { OrderPaymentConfig } from "./config";

export type Scheduler = (fn: () => void) => void;

const afterScheduler: Scheduler = (fn) => {
  try {
    after(fn);
  } catch {
    void fn();
  }
};

async function loadOwned(
  db: Database,
  taskId: string,
  sessionId: string,
): Promise<{ task: Awaited<ReturnType<typeof findTaskById>>; payment: OrderPaymentRow }> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "TASK_FORBIDDEN", "This order belongs to another device.");
  }
  const payment = await findLatestOrderPaymentByTaskId(db, taskId);
  if (!payment) {
    throw new HttpError(
      404,
      "NO_PAYMENT_INTENT",
      "Start a payment before reporting a transaction.",
    );
  }
  return { task, payment };
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * The buyer's wallet returned a tx hash. Move the intent to CONFIRMING and
 * kick off server-side verification. Idempotent on `txHash`.
 */
export async function recordSubmittedOrderPayment(
  db: Database,
  taskId: string,
  sessionId: string,
  input: { txHash: string },
  schedule: Scheduler = afterScheduler,
): Promise<OrderPaymentRow> {
  const txHash = input.txHash?.trim();
  if (!txHash || !TX_HASH.test(txHash)) {
    throw new HttpError(422, "BAD_TX_HASH", "That doesn't look like a transaction hash.");
  }

  const { payment } = await loadOwned(db, taskId, sessionId);

  // Same hash, already recorded (retry / double-tap) → return as-is.
  if (payment.txHash === txHash) {
    scheduleVerify(schedule, db, payment.id);
    return payment;
  }
  const existingForHash = await findOrderPaymentByTxHash(db, txHash);
  if (existingForHash) {
    if (existingForHash.id === payment.id) return existingForHash;
    throw new HttpError(
      409,
      "TX_ALREADY_USED",
      "That transaction is already linked to another payment.",
    );
  }

  if (payment.status === "CONFIRMED") return payment;
  if (isOrderPaymentTerminal(payment.status)) {
    throw new HttpError(
      409,
      "PAYMENT_CLOSED",
      "This payment is no longer open. Start a new one from the order.",
    );
  }
  if (payment.expiresAt.getTime() <= Date.now()) {
    const expired = await updateOrderPayment(db, payment.id, {
      status: "EXPIRED",
      error: "payment window elapsed before a transaction was reported",
    });
    void expired;
    throw new HttpError(409, "PAYMENT_EXPIRED", "This payment window closed. Start a new one.");
  }

  const updated = await updateOrderPayment(db, payment.id, { status: "CONFIRMING", txHash });
  await appendAuditEvent(db, {
    type: "order_payment.submitted",
    taskId,
    businessId: payment.businessId,
    data: { paymentId: payment.id, txHash },
  });
  try {
    // Analytics must never affect settlement (M10.5 §37, M9.5 §4).
    forwardServerAnalyticsEvent({
      event: "payment_submitted",
      actorKey: payment.buyerSession,
      role: "buyer",
      props: { payment_method: "minipay", network: payment.chainId, asset: payment.asset },
      insertId: `payment_submitted:${payment.id}`,
    });
  } catch {
    /* isolated */
  }

  scheduleVerify(schedule, db, payment.id);
  return updated;
}

function scheduleVerify(schedule: Scheduler, db: Database, paymentId: string): void {
  try {
    schedule(() => {
      void verifyOrderPayment(db, paymentId).catch(() => undefined);
    });
  } catch {
    /* scheduling must never surface to the caller */
  }
}

/** The buyer dismissed the wallet without paying. The ORDER is untouched (§21). */
export async function cancelOrderPayment(
  db: Database,
  taskId: string,
  sessionId: string,
): Promise<OrderPaymentRow> {
  const { payment } = await loadOwned(db, taskId, sessionId);
  if (payment.status === "CONFIRMED" || payment.txHash) return payment; // can't cancel a real tx
  if (isOrderPaymentTerminal(payment.status)) return payment;

  const cancelled = await updateOrderPayment(db, payment.id, {
    status: "CANCELLED",
    error: "buyer dismissed the wallet",
  });
  await appendAuditEvent(db, {
    type: "order_payment.cancelled",
    taskId,
    businessId: payment.businessId,
    data: { paymentId: payment.id },
  });
  return cancelled;
}

/** Re-run verification for whatever is in flight — used on page load (§22 resumption). */
export async function resumeOrderPaymentVerification(
  db: Database,
  taskId: string,
  opts: { client?: ReceiptClient; config?: OrderPaymentConfig } = {},
): Promise<OrderPaymentRow | null> {
  const payment = await findLatestOrderPaymentByTaskId(db, taskId);
  if (!payment || !payment.txHash) return payment;
  if (payment.status === "SUBMITTED" || payment.status === "CONFIRMING") {
    const { row } = await verifyOrderPayment(db, payment.id, opts).catch(() => ({ row: payment }));
    return row;
  }
  return payment;
}
