import { describe, expect, it } from "vitest";

import {
  describePricing,
  describePricingForBusiness,
  hasComparablePrice,
  PRICING_MODELS,
  PRICING_MODEL_COPY,
  PUBLISHED_PRICE_CAVEAT,
  servicePricingInputSchema,
  type ServicePricing,
} from "./model";

/**
 * Pricing models (milestone 5 §5).
 *
 * The product supports three genuinely different commercial behaviours through
 * one primitive. These tests hold two lines: the enum never reaches a screen,
 * and a published figure is never presented as though it were an offer.
 */

const fixed: ServicePricing = {
  model: "FIXED",
  published: { amount: 50, currency: "NGN", unit: "per page" },
};
const startingFrom: ServicePricing = {
  model: "STARTING_FROM",
  published: { amount: 15_000, currency: "NGN", unit: "per 100" },
};
const perJob: ServicePricing = { model: "QUOTE_REQUIRED", published: null };

describe("what a buyer reads", () => {
  it("states a set price plainly", () => {
    expect(describePricing(fixed)).toBe("NGN 50 per page");
  });

  it("marks a starting price as a floor, not the price", () => {
    expect(describePricing(startingFrom)).toBe("From NGN 15,000 per 100");
  });

  it("says a per-job service has no published price rather than showing zero", () => {
    expect(describePricing(perJob)).toBe("Priced per job");
    expect(describePricing({ model: "FIXED", published: null })).toBe("Priced per job");
  });

  it("handles a flat job price with no unit", () => {
    expect(
      describePricing({ model: "FIXED", published: { amount: 2500, currency: "NGN", unit: null } }),
    ).toBe("NGN 2,500");
  });

  it("never leaks the enum into buyer- or business-facing copy", () => {
    for (const model of PRICING_MODELS) {
      const pricing: ServicePricing = {
        model,
        published: model === "QUOTE_REQUIRED" ? null : { amount: 100, currency: "NGN", unit: null },
      };
      expect(describePricing(pricing)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(describePricingForBusiness(pricing)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      const copy = PRICING_MODEL_COPY[model];
      expect(copy.label).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(copy.forBusiness).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });

  it("keeps a published figure separate from an offer", () => {
    expect(PUBLISHED_PRICE_CAVEAT).toMatch(/quote they send.*counts/i);
    // Only a set price is safe to compare on before a quote exists.
    expect(hasComparablePrice(fixed)).toBe(true);
    expect(hasComparablePrice(startingFrom)).toBe(false);
    expect(hasComparablePrice(perJob)).toBe(false);
  });
});

describe("what a business reads about its own pricing", () => {
  it("tells them exactly what a customer will see", () => {
    expect(describePricingForBusiness(fixed)).toBe("Customers see NGN 50 per page.");
    expect(describePricingForBusiness(startingFrom)).toContain("from NGN 15,000 per 100");
    expect(describePricingForBusiness(perJob)).toBe("You price each request individually.");
  });

  it("gives every model a concrete example an operator would recognise", () => {
    for (const model of PRICING_MODELS) {
      expect(PRICING_MODEL_COPY[model].example.length).toBeGreaterThan(8);
    }
  });
});

describe("setting a price", () => {
  it("requires an amount unless the service is priced per job", () => {
    expect(
      servicePricingInputSchema.safeParse({ model: "FIXED", amount: null, unit: null }).success,
    ).toBe(false);
    expect(
      servicePricingInputSchema.safeParse({ model: "STARTING_FROM", amount: null, unit: null })
        .success,
    ).toBe(false);
    expect(
      servicePricingInputSchema.safeParse({ model: "QUOTE_REQUIRED", amount: null, unit: null })
        .success,
    ).toBe(true);
  });

  it("rejects a zero or negative price", () => {
    expect(
      servicePricingInputSchema.safeParse({ model: "FIXED", amount: 0, unit: null }).success,
    ).toBe(false);
    expect(
      servicePricingInputSchema.safeParse({ model: "FIXED", amount: -5, unit: null }).success,
    ).toBe(false);
  });

  it("accepts a valid set price", () => {
    const parsed = servicePricingInputSchema.safeParse({
      model: "FIXED",
      amount: 50,
      unit: "per page",
    });
    expect(parsed.success).toBe(true);
  });
});
