import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { quoteRoutes, type NewQuoteRouteRow, type QuoteRouteRow } from "@/lib/db/schema";

export async function insertRoute(db: Database, values: NewQuoteRouteRow): Promise<QuoteRouteRow> {
  const [row] = await db.insert(quoteRoutes).values(values).returning();
  return row;
}

export async function findRouteById(db: Database, id: string): Promise<QuoteRouteRow | null> {
  const [row] = await db.select().from(quoteRoutes).where(eq(quoteRoutes.id, id)).limit(1);
  return row ?? null;
}

export async function findRouteByBusinessAndSlug(
  db: Database,
  businessId: string,
  slug: string,
): Promise<QuoteRouteRow | null> {
  const [row] = await db
    .select()
    .from(quoteRoutes)
    .where(and(eq(quoteRoutes.businessId, businessId), eq(quoteRoutes.slug, slug)))
    .limit(1);
  return row ?? null;
}

export async function updateRoute(
  db: Database,
  id: string,
  patch: Partial<NewQuoteRouteRow>,
): Promise<QuoteRouteRow> {
  const [row] = await db.update(quoteRoutes).set(patch).where(eq(quoteRoutes.id, id)).returning();
  return row;
}
