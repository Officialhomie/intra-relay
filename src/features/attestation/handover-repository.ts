import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  handoverAttestations,
  type HandoverAttestationRow,
  type NewHandoverAttestationRow,
} from "@/lib/db/schema";

/**
 * `taskId` is unique, mirroring `commitments/repository.ts`'s idempotency
 * story: a retried "present the code" call converges on the one row for that
 * task rather than minting a fresh signing request each time.
 */
export async function insertOrGetHandoverAttestation(
  db: Database,
  values: NewHandoverAttestationRow,
): Promise<{ row: HandoverAttestationRow; created: boolean }> {
  const inserted = await db
    .insert(handoverAttestations)
    .values(values)
    .onConflictDoNothing({ target: handoverAttestations.taskId })
    .returning();

  if (inserted[0]) return { row: inserted[0], created: true };

  const existing = await findHandoverAttestationByTaskId(db, values.taskId);
  if (!existing) {
    throw new Error(
      `Handover attestation insert for task ${values.taskId} neither inserted nor found.`,
    );
  }
  return { row: existing, created: false };
}

export async function findHandoverAttestationByTaskId(
  db: Database,
  taskId: string,
): Promise<HandoverAttestationRow | null> {
  const [row] = await db
    .select()
    .from(handoverAttestations)
    .where(eq(handoverAttestations.taskId, taskId))
    .limit(1);
  return row ?? null;
}

export async function updateHandoverAttestation(
  db: Database,
  id: string,
  patch: Partial<NewHandoverAttestationRow>,
): Promise<HandoverAttestationRow> {
  const [row] = await db
    .update(handoverAttestations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(handoverAttestations.id, id))
    .returning();
  return row;
}
