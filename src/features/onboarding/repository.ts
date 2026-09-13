import { desc, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  businesses,
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

export interface OnboardingSubmissionWithBusiness {
  submission: OnboardingSubmissionRow;
  /** Public identity of the business this submission created, if it created one. */
  business: { slug: string; name: string } | null;
}

/**
 * The operator's list, with each processed submission's business identity
 * attached (M10.2D).
 *
 * The slug is what makes the manage-link recovery endpoint reachable: without
 * it an operator looking at a Tally submission has no way to name the business
 * they need to send a link to. Only the slug and name are joined — never the
 * manage token, which is retrieved one business at a time, deliberately.
 */
export async function listOnboardingSubmissionsWithBusiness(
  db: Database,
  limit = 50,
): Promise<OnboardingSubmissionWithBusiness[]> {
  const rows = await db
    .select({
      submission: onboardingSubmissions,
      slug: businesses.slug,
      name: businesses.name,
    })
    .from(onboardingSubmissions)
    .leftJoin(businesses, eq(onboardingSubmissions.businessId, businesses.id))
    .orderBy(desc(onboardingSubmissions.receivedAt))
    .limit(limit);

  return rows.map((row) => ({
    submission: row.submission,
    business: row.slug && row.name ? { slug: row.slug, name: row.name } : null,
  }));
}
