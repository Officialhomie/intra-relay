import { describe, expect, it } from "vitest";

import type { BusinessRow, QuoteRouteRow, QuoteRow } from "@/lib/db/schema";

import { buildRecommendationDetail, VERIFICATION_NOTE } from "./recommendation";

const NOW = new Date("2026-08-30T12:00:00.000Z");

const business = {
  name: "Campus Prints NG",
  city: "Lagos",
  country: "Nigeria",
} as BusinessRow;

const route = { priceUpdatedAt: new Date("2026-08-20T00:00:00.000Z") } as QuoteRouteRow;

const quote = (over: Partial<QuoteRow> = {}): QuoteRow =>
  ({
    id: "q1",
    status: "RECEIVED",
    amountMin: "15000.00",
    amountMax: null,
    deliveryCharge: "1500.00",
    currency: "NGN",
    turnaround: "same day",
    availabilityNote: null,
    assumptions: "Artwork print-ready",
    confidence: "medium",
    fixed: true,
    expiresAt: null,
    ...over,
  }) as QuoteRow;

describe("buildRecommendationDetail (FR-REC-001)", () => {
  it("explains the price, turnaround, and route freshness", () => {
    const d = buildRecommendationDetail({
      quote: quote(),
      route,
      business,
      brief: { quantity: 300 },
      now: NOW,
    });
    expect(d.reasoning.join(" ")).toMatch(/operator-verified printer in Lagos/i);
    expect(d.reasoning.join(" ")).toMatch(/NGN 16,?500/);
    expect(d.reasoning.join(" ")).toMatch(/per flyer for 300 copies/i);
    expect(d.reasoning.join(" ")).toMatch(/price list was last confirmed on 2026-08-20/);
    expect(d.normalized.unitPriceMin).toBe(50);
  });

  it("always states Intra has not verified the quote", () => {
    const d = buildRecommendationDetail({ quote: quote(), route, business, brief: {}, now: NOW });
    expect(d.verificationNote).toBe(VERIFICATION_NOTE);
    expect(d.uncertainties[0]).toMatch(/not independently verified/i);
    expect(d.quoteExpired).toBe(false);
  });

  it("flags an estimate and a missing expiry as uncertainties", () => {
    const d = buildRecommendationDetail({
      quote: quote({ fixed: false }),
      route,
      business,
      brief: {},
      now: NOW,
    });
    expect(d.uncertainties.join(" ")).toMatch(/estimate, not a committed price/i);
    expect(d.uncertainties.join(" ")).toMatch(/no expiry was given/i);
  });

  it("marks an expired quote in the uncertainties", () => {
    const d = buildRecommendationDetail({
      quote: quote({ expiresAt: new Date("2026-08-01T00:00:00.000Z") }),
      route,
      business,
      brief: {},
      now: NOW,
    });
    expect(d.quoteExpired).toBe(true);
    expect(d.uncertainties.join(" ")).toMatch(/has EXPIRED/);
  });

  it("surfaces a low-confidence flag", () => {
    const d = buildRecommendationDetail({
      quote: quote({ confidence: "low" }),
      route,
      business,
      brief: {},
      now: NOW,
    });
    expect(d.uncertainties.join(" ")).toMatch(/low confidence/i);
  });
});
