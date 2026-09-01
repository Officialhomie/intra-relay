import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { servicePayments, type ServicePaymentRow } from "@/lib/db/schema";

type NewServicePayment = typeof servicePayments.$inferInsert;

/**
 * All writes here INSERT — `service_payments` rows are immutable (BR-005).
 * There is deliberately no update function.
 */
export async function insertServicePayment(
  db: Database,
  values: NewServicePayment,
): Promise<ServicePaymentRow> {
  const [row] = await db.insert(servicePayments).values(values).returning();
  return row;
}

/**
 * Insert a receipt keyed by `authorizationKey`, tolerating a concurrent request
 * that already recorded the same authorisation. Two agents presenting the same
 * `X-PAYMENT` at once converge on one immutable row (the `authorization_key`
 * unique index is the backstop). Falls back to a plain insert when there is no
 * key (e.g. an undecodable header).
 */
export async function insertOrGetByAuthorizationKey(
  db: Database,
  values: NewServicePayment,
): Promise<ServicePaymentRow> {
  if (!values.authorizationKey) return insertServicePayment(db, values);

  const [row] = await db
    .insert(servicePayments)
    .values(values)
    .onConflictDoNothing({ target: servicePayments.authorizationKey })
    .returning();
  if (row) return row;

  const existing = await findPaymentByAuthorizationKey(db, values.authorizationKey);
  if (existing) return existing;
  // The conflicting row vanished between the insert and the re-read (should not
  // happen — rows are never deleted). Retry once as a plain insert.
  return insertServicePayment(db, values);
}

export async function listPaymentsByTask(
  db: Database,
  taskId: string,
): Promise<ServicePaymentRow[]> {
  return db.select().from(servicePayments).where(eq(servicePayments.taskId, taskId));
}

export async function findPaymentByAuthorizationKey(
  db: Database,
  authorizationKey: string,
): Promise<ServicePaymentRow | null> {
  const [row] = await db
    .select()
    .from(servicePayments)
    .where(eq(servicePayments.authorizationKey, authorizationKey))
    .limit(1);
  return row ?? null;
}
