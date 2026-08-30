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
