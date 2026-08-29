import type { QuoteRouteRow } from "@/lib/db/schema";

/**
 * A route's price data is only trusted for this long after the supplier /
 * operator last confirmed it (`priceUpdatedAt`). Past that it is "stale" and the
 * public capability API refuses to take a quote request against it
 * (BR-003, BR-006 — operators can also pause manually).
 */
export const PRICE_FRESHNESS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface RouteFreshness {
  lastUpdatedAt: string;
  priceUpdatedAt: string | null;
  priceAgeMs: number | null;
  stale: boolean;
}

export function routeFreshness(
  route: Pick<QuoteRouteRow, "priceUpdatedAt" | "updatedAt">,
  now: Date = new Date(),
): RouteFreshness {
  const priceAgeMs = route.priceUpdatedAt ? now.getTime() - route.priceUpdatedAt.getTime() : null;
  return {
    lastUpdatedAt: route.updatedAt.toISOString(),
    priceUpdatedAt: route.priceUpdatedAt?.toISOString() ?? null,
    priceAgeMs,
    stale: priceAgeMs === null || priceAgeMs > PRICE_FRESHNESS_MAX_AGE_MS,
  };
}

/** A route may take a quote request only when ACTIVE, verified, and fresh. */
export function routeIsQuoteReady(
  route: Pick<QuoteRouteRow, "status" | "verifiedAt" | "priceUpdatedAt" | "updatedAt">,
  businessVerifiedByOperator: boolean,
  now: Date = new Date(),
): { ready: boolean; reason: "OK" | "NOT_ACTIVE" | "NOT_VERIFIED" | "STALE" } {
  if (route.status !== "ACTIVE") return { ready: false, reason: "NOT_ACTIVE" };
  if (!route.verifiedAt || !businessVerifiedByOperator)
    return { ready: false, reason: "NOT_VERIFIED" };
  if (routeFreshness(route, now).stale) return { ready: false, reason: "STALE" };
  return { ready: true, reason: "OK" };
}
