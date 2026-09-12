import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { businesses, type BusinessRow, type NewBusinessRow } from "@/lib/db/schema";

export async function insertBusiness(db: Database, values: NewBusinessRow): Promise<BusinessRow> {
  const [row] = await db.insert(businesses).values(values).returning();
  return row;
}

export async function findBusinessBySlug(db: Database, slug: string): Promise<BusinessRow | null> {
  const [row] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return row ?? null;
}

export async function findBusinessById(db: Database, id: string): Promise<BusinessRow | null> {
  const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  return row ?? null;
}

/** Duplicate-detection signal for remote onboarding (M10.1) — same order contact, different name. */
export async function findBusinessByContactChannelValue(
  db: Database,
  contactChannelValue: string,
): Promise<BusinessRow | null> {
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.contactChannelValue, contactChannelValue))
    .limit(1);
  return row ?? null;
}

export async function updateBusiness(
  db: Database,
  id: string,
  patch: Partial<NewBusinessRow>,
): Promise<BusinessRow> {
  const [row] = await db.update(businesses).set(patch).where(eq(businesses.id, id)).returning();
  return row;
}
