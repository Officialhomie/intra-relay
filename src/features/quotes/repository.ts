import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { quotes, recommendations, type QuoteRow, type RecommendationRow } from "@/lib/db/schema";

import type { QuoteStatus } from "./status";

type NewQuote = typeof quotes.$inferInsert;
type NewRecommendation = typeof recommendations.$inferInsert;

export async function insertQuote(db: Database, values: NewQuote): Promise<QuoteRow> {
  const [row] = await db.insert(quotes).values(values).returning();
  return row;
}

export async function updateQuoteStatus(
  db: Database,
  id: string,
  status: QuoteStatus,
): Promise<QuoteRow> {
  const [row] = await db.update(quotes).set({ status }).where(eq(quotes.id, id)).returning();
  return row;
}

/**
 * Update a quote's LIFECYCLE, never its commercial terms.
 *
 * The field list is closed on purpose: amount, currency, turnaround and expiry
 * are the terms a buyer agrees to, and there is no repository function anywhere
 * that can change them on an existing row. A different price is always a new
 * row (see `quotes/revision.ts`).
 */
export type QuoteLifecyclePatch = Pick<
  Partial<NewQuote>,
  "status" | "acceptedAt" | "declineReason"
>;

export async function updateQuote(
  db: Database,
  id: string,
  patch: QuoteLifecyclePatch,
): Promise<QuoteRow> {
  const [row] = await db.update(quotes).set(patch).where(eq(quotes.id, id)).returning();
  return row;
}

export async function updateRecommendation(
  db: Database,
  id: string,
  patch: Partial<NewRecommendation>,
): Promise<RecommendationRow> {
  const [row] = await db
    .update(recommendations)
    .set(patch)
    .where(eq(recommendations.id, id))
    .returning();
  return row;
}

export async function insertRecommendation(
  db: Database,
  values: NewRecommendation,
): Promise<RecommendationRow> {
  const [row] = await db.insert(recommendations).values(values).returning();
  return row;
}

export async function findRecommendationByTask(
  db: Database,
  taskId: string,
): Promise<RecommendationRow | null> {
  const [row] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.taskId, taskId))
    .limit(1);
  return row ?? null;
}
