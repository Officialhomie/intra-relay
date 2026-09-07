import { and, desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { orderPayments, type NewOrderPaymentRow, type OrderPaymentRow } from "@/lib/db/schema";

import { ORDER_PAYMENT_IN_FLIGHT } from "./status";

const LIVE_STATUSES = ["CREATED", "AWAITING_WALLET", ...ORDER_PAYMENT_IN_FLIGHT] as const;

export async function insertOrderPayment(
  db: Database,
  values: NewOrderPaymentRow,
): Promise<OrderPaymentRow> {
  const [row] = await db.insert(orderPayments).values(values).returning();
  return row;
}

export async function findOrderPaymentById(
  db: Database,
  id: string,
): Promise<OrderPaymentRow | null> {
  const [row] = await db.select().from(orderPayments).where(eq(orderPayments.id, id)).limit(1);
  return row ?? null;
}

/** The most recent intent for a task (any status) — what the buyer's UI shows. */
export async function findLatestOrderPaymentByTaskId(
  db: Database,
  taskId: string,
): Promise<OrderPaymentRow | null> {
  const [row] = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.taskId, taskId))
    .orderBy(desc(orderPayments.createdAt))
    .limit(1);
  return row ?? null;
}

/** The single non-terminal intent for a commitment, if one exists. */
export async function findLiveOrderPaymentByCommitment(
  db: Database,
  commitmentId: string,
): Promise<OrderPaymentRow | null> {
  const [row] = await db
    .select()
    .from(orderPayments)
    .where(
      and(
        eq(orderPayments.commitmentId, commitmentId),
        inArray(orderPayments.status, [...LIVE_STATUSES]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findConfirmedOrderPaymentByCommitment(
  db: Database,
  commitmentId: string,
): Promise<OrderPaymentRow | null> {
  const [row] = await db
    .select()
    .from(orderPayments)
    .where(and(eq(orderPayments.commitmentId, commitmentId), eq(orderPayments.status, "CONFIRMED")))
    .limit(1);
  return row ?? null;
}

export async function findOrderPaymentByTxHash(
  db: Database,
  txHash: string,
): Promise<OrderPaymentRow | null> {
  const [row] = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.txHash, txHash))
    .limit(1);
  return row ?? null;
}

export async function listTaskOrderPayments(
  db: Database,
  taskId: string,
): Promise<OrderPaymentRow[]> {
  return db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.taskId, taskId))
    .orderBy(desc(orderPayments.createdAt));
}

export async function updateOrderPayment(
  db: Database,
  id: string,
  patch: Partial<NewOrderPaymentRow>,
): Promise<OrderPaymentRow> {
  const [row] = await db
    .update(orderPayments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(orderPayments.id, id))
    .returning();
  return row;
}

/** Expire every live intent tied to a commitment (terms changed / quote revised). */
export async function expireLiveOrderPaymentsForCommitment(
  db: Database,
  commitmentId: string,
): Promise<OrderPaymentRow[]> {
  return db
    .update(orderPayments)
    .set({ status: "EXPIRED", error: "commercial terms changed", updatedAt: new Date() })
    .where(
      and(
        eq(orderPayments.commitmentId, commitmentId),
        inArray(orderPayments.status, [...LIVE_STATUSES]),
      ),
    )
    .returning();
}
