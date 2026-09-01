import { eq, and } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

import type { Database } from "@/lib/db/client";
import { businesses, quoteRoutes, tasks } from "@/lib/db/schema";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * ADR-008 capability check: does `token` match the business's manage token?
 * The manage token is an opaque random string — never a wallet secret.
 */
export async function manageTokenMatchesBusiness(
  db: Database,
  businessId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ manageToken: businesses.manageToken })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return row ? constantTimeEqual(row.manageToken, token) : false;
}

export async function manageTokenMatchesBusinessSlug(
  db: Database,
  slug: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ manageToken: businesses.manageToken })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1);
  return row ? constantTimeEqual(row.manageToken, token) : false;
}

export async function manageTokenMatchesRoute(
  db: Database,
  routeId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ manageToken: businesses.manageToken })
    .from(quoteRoutes)
    .innerJoin(businesses, eq(quoteRoutes.businessId, businesses.id))
    .where(and(eq(quoteRoutes.id, routeId)))
    .limit(1);
  return row ? constantTimeEqual(row.manageToken, token) : false;
}

/** Does `token` match the manage token of the business that owns this task's route? */
export async function manageTokenMatchesTask(
  db: Database,
  taskId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ manageToken: businesses.manageToken })
    .from(tasks)
    .innerJoin(quoteRoutes, eq(tasks.routeId, quoteRoutes.id))
    .innerJoin(businesses, eq(quoteRoutes.businessId, businesses.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row ? constantTimeEqual(row.manageToken, token) : false;
}
