import { asc, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { auditEvents, type AuditEventRow } from "@/lib/db/schema";

export interface AuditEventInput {
  type: string;
  taskId?: string | null;
  businessId?: string | null;
  routeId?: string | null;
  quoteId?: string | null;
  paymentId?: string | null;
  data?: Record<string, unknown>;
}

/** Append-only audit trail (NFR-REL-001). */
export async function appendAuditEvent(
  db: Database,
  input: AuditEventInput,
): Promise<AuditEventRow> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      type: input.type,
      taskId: input.taskId ?? null,
      businessId: input.businessId ?? null,
      routeId: input.routeId ?? null,
      quoteId: input.quoteId ?? null,
      paymentId: input.paymentId ?? null,
      data: input.data ?? {},
    })
    .returning();
  return row;
}

export async function listTaskAuditEvents(db: Database, taskId: string): Promise<AuditEventRow[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.taskId, taskId))
    .orderBy(asc(auditEvents.createdAt));
}
