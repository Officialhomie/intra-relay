import { and, desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  businesses,
  quoteRoutes,
  tasks,
  type BusinessRow,
  type QuoteRouteRow,
  type TaskRow,
} from "@/lib/db/schema";
import { findBusinessBySlug } from "@/features/businesses/repository";

/** Public (safe) view of a business — never includes the manage token. */
export type PublicBusiness = Omit<BusinessRow, "manageToken">;

export function toPublicBusiness(row: BusinessRow): PublicBusiness {
  const { manageToken: _managed, ...safe } = row;
  void _managed;
  return safe;
}

export interface SupplierWorkspace {
  business: PublicBusiness;
  routes: QuoteRouteRow[];
  /** AWAITING_QUOTE tasks bound to one of this business's routes. */
  incoming: { task: TaskRow; route: QuoteRouteRow }[];
}

export async function getSupplierWorkspace(
  db: Database,
  slug: string,
): Promise<SupplierWorkspace | null> {
  const business = await findBusinessBySlug(db, slug);
  if (!business) return null;

  const routes = await db
    .select()
    .from(quoteRoutes)
    .where(eq(quoteRoutes.businessId, business.id))
    .orderBy(desc(quoteRoutes.createdAt));

  const routeIds = routes.map((route) => route.id);
  const incoming =
    routeIds.length === 0
      ? []
      : (
          await db
            .select({ task: tasks, route: quoteRoutes })
            .from(tasks)
            .innerJoin(quoteRoutes, eq(tasks.routeId, quoteRoutes.id))
            .where(and(inArray(tasks.routeId, routeIds), eq(tasks.status, "AWAITING_QUOTE")))
            .orderBy(desc(tasks.submittedAt))
        ).map((row) => ({ task: row.task, route: row.route }));

  return { business: toPublicBusiness(business), routes, incoming };
}

export interface OperatorQueueItem {
  route: QuoteRouteRow;
  business: PublicBusiness;
}

/**
 * Routes an operator needs to see: everything except archived. Drafts and
 * pending-verification routes need activation; active routes can be paused.
 */
export async function listOperatorQueue(db: Database): Promise<OperatorQueueItem[]> {
  const rows = await db
    .select({ route: quoteRoutes, business: businesses })
    .from(quoteRoutes)
    .innerJoin(businesses, eq(quoteRoutes.businessId, businesses.id))
    .where(inArray(quoteRoutes.status, ["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "PAUSED"]))
    .orderBy(desc(quoteRoutes.updatedAt));
  return rows.map((row) => ({ route: row.route, business: toPublicBusiness(row.business) }));
}
