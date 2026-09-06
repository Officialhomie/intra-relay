import type { QuoteRouteRow } from "@/lib/db/schema";

/**
 * A route's price data is only trusted for this long after the supplier /
 * operator last confirmed it (`priceUpdatedAt`). Past that it is "stale" and the
 * public capability API refuses to take a quote request against it
 * (BR-003, BR-006 — operators can also pause manually).
 */
export const PRICE_FRESHNESS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const PRICE_FRESHNESS_MAX_AGE_DAYS = PRICE_FRESHNESS_MAX_AGE_MS / (24 * 60 * 60 * 1000);

export interface RouteFreshness {
  lastUpdatedAt: string;
  priceUpdatedAt: string | null;
  priceAgeMs: number | null;
  /** ISO time after which the price/availability data is considered stale. */
  staleAfter: string | null;
  stale: boolean;
}

export function routeFreshness(
  route: Pick<QuoteRouteRow, "priceUpdatedAt" | "updatedAt">,
  now: Date = new Date(),
): RouteFreshness {
  const priceAgeMs = route.priceUpdatedAt ? now.getTime() - route.priceUpdatedAt.getTime() : null;
  const staleAfter = route.priceUpdatedAt
    ? new Date(route.priceUpdatedAt.getTime() + PRICE_FRESHNESS_MAX_AGE_MS).toISOString()
    : null;
  return {
    lastUpdatedAt: route.updatedAt.toISOString(),
    priceUpdatedAt: route.priceUpdatedAt?.toISOString() ?? null,
    priceAgeMs,
    staleAfter,
    stale: priceAgeMs === null || priceAgeMs > PRICE_FRESHNESS_MAX_AGE_MS,
  };
}

export type RouteReadyReason = "OK" | "NOT_ACTIVE" | "NOT_VERIFIED" | "STALE";

/**
 * Agent-facing explanation for each `RouteReadyReason`. Written for another
 * agent (or its operator) to act on without reading Intra's source.
 */
export const ROUTE_READY_DETAIL: Record<RouteReadyReason, string> = {
  OK: "The route is active, operator-verified, and its price data is fresh. It accepts public quote requests.",
  NOT_ACTIVE:
    "The route is not ACTIVE (it is a draft, awaiting verification, paused, or archived). It does not accept public quote requests.",
  NOT_VERIFIED:
    "The route or its business is not operator-verified. It does not accept public quote requests.",
  STALE:
    "The route is ACTIVE but its price/availability data has not been reconfirmed within the freshness window, so it is explicitly unavailable until the supplier refreshes it. It does not accept public quote requests.",
};

/** A route may take a quote request only when ACTIVE, verified, and fresh. */
export function routeIsQuoteReady(
  route: Pick<QuoteRouteRow, "status" | "verifiedAt" | "priceUpdatedAt" | "updatedAt">,
  businessVerifiedByOperator: boolean,
  now: Date = new Date(),
): { ready: boolean; reason: RouteReadyReason } {
  if (route.status !== "ACTIVE") return { ready: false, reason: "NOT_ACTIVE" };
  if (!route.verifiedAt || !businessVerifiedByOperator)
    return { ready: false, reason: "NOT_VERIFIED" };
  if (routeFreshness(route, now).stale) return { ready: false, reason: "STALE" };
  return { ready: true, reason: "OK" };
}
