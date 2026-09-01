import { describe, expect, it } from "vitest";

import type { QuoteRouteRow } from "@/lib/db/schema";

import {
  PRICE_FRESHNESS_MAX_AGE_DAYS,
  PRICE_FRESHNESS_MAX_AGE_MS,
  ROUTE_READY_DETAIL,
  routeFreshness,
  routeIsQuoteReady,
} from "./freshness";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function routeRow(overrides: Partial<QuoteRouteRow> = {}): QuoteRouteRow {
  return {
    status: "ACTIVE",
    verifiedAt: new Date("2026-08-20T00:00:00.000Z"),
    priceUpdatedAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date("2026-08-29T00:00:00.000Z"),
    ...overrides,
  } as QuoteRouteRow;
}

describe("routeFreshness (BR-003, BR-006)", () => {
  it("reports a staleAfter exactly maxAge past the price confirmation", () => {
    const fresh = routeFreshness(routeRow(), NOW);
    expect(fresh.stale).toBe(false);
    expect(fresh.staleAfter).toBe(
      new Date(
        new Date("2026-08-29T00:00:00.000Z").getTime() + PRICE_FRESHNESS_MAX_AGE_MS,
      ).toISOString(),
    );
    expect(PRICE_FRESHNESS_MAX_AGE_DAYS).toBe(14);
  });

  it("is stale once the price data passes the freshness window", () => {
    const fresh = routeFreshness(
      routeRow({ priceUpdatedAt: new Date("2026-07-01T00:00:00.000Z") }),
      NOW,
    );
    expect(fresh.stale).toBe(true);
  });

  it("is stale when the price was never confirmed", () => {
    const fresh = routeFreshness(routeRow({ priceUpdatedAt: null }), NOW);
    expect(fresh.stale).toBe(true);
    expect(fresh.staleAfter).toBeNull();
  });
});

describe("routeIsQuoteReady (AC-ROUTE-002)", () => {
  it("is ready only when ACTIVE, operator-verified, and fresh", () => {
    expect(routeIsQuoteReady(routeRow(), true, NOW)).toEqual({ ready: true, reason: "OK" });
  });

  it("is NOT_ACTIVE for a paused or pending route", () => {
    expect(routeIsQuoteReady(routeRow({ status: "PAUSED" }), true, NOW).reason).toBe("NOT_ACTIVE");
    expect(routeIsQuoteReady(routeRow({ status: "PENDING_VERIFICATION" }), true, NOW).reason).toBe(
      "NOT_ACTIVE",
    );
  });

  it("is NOT_VERIFIED when the business is not operator-verified", () => {
    expect(routeIsQuoteReady(routeRow(), false, NOW).reason).toBe("NOT_VERIFIED");
    expect(routeIsQuoteReady(routeRow({ verifiedAt: null }), true, NOW).reason).toBe(
      "NOT_VERIFIED",
    );
  });

  it("is STALE for an ACTIVE, verified route with old price data", () => {
    const stale = routeRow({ priceUpdatedAt: new Date("2026-07-01T00:00:00.000Z") });
    expect(routeIsQuoteReady(stale, true, NOW)).toEqual({ ready: false, reason: "STALE" });
  });

  it("has an agent-readable detail string for every reason", () => {
    for (const reason of ["OK", "NOT_ACTIVE", "NOT_VERIFIED", "STALE"] as const) {
      expect(ROUTE_READY_DETAIL[reason].length).toBeGreaterThan(0);
    }
  });
});
