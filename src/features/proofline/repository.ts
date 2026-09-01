import { asc, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  prooflineEvents,
  type NewProoflineEventRow,
  type ProoflineEventRow,
} from "@/lib/db/schema";

export async function insertProoflineEvent(
  db: Database,
  values: NewProoflineEventRow,
): Promise<ProoflineEventRow> {
  const [row] = await db.insert(prooflineEvents).values(values).returning();
  return row;
}

/** Append-only log for one task, oldest first. */
export async function listProoflineEvents(
  db: Database,
  taskId: string,
): Promise<ProoflineEventRow[]> {
  return db
    .select()
    .from(prooflineEvents)
    .where(eq(prooflineEvents.taskId, taskId))
    .orderBy(asc(prooflineEvents.createdAt));
}
