import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { quotes, recommendations, type QuoteRow, type RecommendationRow } from "@/lib/db/schema";

type NewQuote = typeof quotes.$inferInsert;
type NewRecommendation = typeof recommendations.$inferInsert;

export async function insertQuote(db: Database, values: NewQuote): Promise<QuoteRow> {
  const [row] = await db.insert(quotes).values(values).returning();
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
