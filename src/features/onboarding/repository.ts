import { desc, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  onboardingSubmissions,
  type NewOnboardingSubmissionRow,
  type OnboardingSubmissionRow,
} from "@/lib/db/schema";

/**
 * `tallySubmissionId` is UNIQUE — `onConflictDoNothing` + re-read is the whole
 * idempotency story (mirrors `insertOrGetCommitment`'s established pattern):
 * a re-delivered webhook converges on the one row created the first time,
 * never a second business.
 */
export async function insertOrGetOnboardingSubmission(
  db: Database,
  values: NewOnboardingSubmissionRow,
): Promise<{ row: OnboardingSubmissionRow; created: boolean }> {
  const inserted = await db
    .insert(onboardingSubmissions)
    .values(values)
    .onConflictDoNothing({ target: onboardingSubmissions.tallySubmissionId })
    .returning();

  if (inserted[0]) return { row: inserted[0], created: true };

  const existing = await findOnboardingSubmissionByTallyId(db, values.tallySubmissionId);
  if (!existing) {
    throw new Error(
      `Onboarding submission ${values.tallySubmissionId} neither inserted nor found.`,
    );
  }
  return { row: existing, created: false };
}

export async function findOnboardingSubmissionByTallyId(
  db: Database,
  tallySubmissionId: string,
): Promise<OnboardingSubmissionRow | null> {
  const [row] = await db
    .select()
    .from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.tallySubmissionId, tallySubmissionId))
    .limit(1);
  return row ?? null;
}

export async function findOnboardingSubmissionByRouteId(
  db: Database,
  routeId: string,
): Promise<OnboardingSubmissionRow | null> {
  const [row] = await db
    .select()
    .from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.routeId, routeId))
    .limit(1);
  return row ?? null;
}

export async function updateOnboardingSubmission(
  db: Database,
  id: string,
  patch: Partial<NewOnboardingSubmissionRow>,
): Promise<OnboardingSubmissionRow> {
  const [row] = await db
    .update(onboardingSubmissions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(onboardingSubmissions.id, id))
    .returning();
  return row;
}

export async function listOnboardingSubmissions(
  db: Database,
  limit = 50,
): Promise<OnboardingSubmissionRow[]> {
  return db
    .select()
    .from(onboardingSubmissions)
    .orderBy(desc(onboardingSubmissions.receivedAt))
    .limit(limit);
}
