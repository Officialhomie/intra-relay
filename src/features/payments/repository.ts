import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { servicePayments, type ServicePaymentRow } from "@/lib/db/schema";

type NewServicePayment = typeof servicePayments.$inferInsert;

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
