import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { commitments, type CommitmentRow, type NewCommitmentRow } from "@/lib/db/schema";

/**
 * `taskId` is unique on `commitments`, so `insertOrGet` is the whole
 * idempotency story: a concurrent or retried approval converges on one row
 * instead of creating a second commitment for the same job.
 */
export async function insertOrGetCommitment(
  db: Database,
  values: NewCommitmentRow,
): Promise<{ row: CommitmentRow; created: boolean }> {
  const inserted = await db
    .insert(commitments)
    .values(values)
    .onConflictDoNothing({ target: commitments.taskId })
    .returning();

  if (inserted[0]) return { row: inserted[0], created: true };

  const existing = await findCommitmentByTaskId(db, values.taskId);
  if (!existing) {
    throw new Error(`Commitment insert for task ${values.taskId} neither inserted nor found.`);
  }
  return { row: existing, created: false };
}

export async function findCommitmentByTaskId(
  db: Database,
  taskId: string,
): Promise<CommitmentRow | null> {
  const [row] = await db.select().from(commitments).where(eq(commitments.taskId, taskId)).limit(1);
  return row ?? null;
}

export async function updateCommitment(
  db: Database,
  id: string,
  patch: Partial<NewCommitmentRow>,
): Promise<CommitmentRow> {
  const [row] = await db
    .update(commitments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(commitments.id, id))
    .returning();
  return row;
}
