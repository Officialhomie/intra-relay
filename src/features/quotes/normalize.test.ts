import { describe, expect, it } from "vitest";

import type { QuoteRow } from "@/lib/db/schema";

import { normalizeAssumptions, normalizeQuote, normalizeTurnaround } from "./normalize";

const baseQuote = (over: Partial<QuoteRow> = {}): Parameters<typeof normalizeQuote>[0] => ({
  amountMin: "15000.00",
  amountMax: null,
  deliveryCharge: null,
  currency: "NGN",
  turnaround: "same day",
  assumptions: null,
  fixed: true,
  ...over,
});

describe("normalizeTurnaround", () => {
  it("maps common phrasings to working days", () => {
    expect(normalizeTurnaround("Same day").businessDays).toBe(0);
    expect(normalizeTurnaround("next working day").businessDays).toBe(1);
    expect(normalizeTurnaround("2 working days").businessDays).toBe(2);
    expect(normalizeTurnaround("3 days").businessDays).toBe(3);
    expect(normalizeTurnaround("1 week").businessDays).toBe(5);
  });

  it("captures hours separately", () => {
    const t = normalizeTurnaround("ready in 48 hours");
    expect(t.hours).toBe(48);
    expect(t.businessDays).toBeNull();
  });

  it("falls back to the raw text it cannot parse", () => {
    const t = normalizeTurnaround("whenever the printer is free");
    expect(t.businessDays).toBeNull();
    expect(t.hours).toBeNull();
    expect(t.label).toBe("whenever the printer is free");
  });
});

describe("normalizeAssumptions", () => {
  it("splits on separators and trims list markers", () => {
    expect(normalizeAssumptions("Artwork print-ready; - pickup only\nno lamination")).toEqual([
      "Artwork print-ready",
      "pickup only",
      "no lamination",
    ]);
  });
  it("returns [] for blank input", () => {
    expect(normalizeAssumptions(null)).toEqual([]);
    expect(normalizeAssumptions("   ")).toEqual([]);
  });
});

describe("normalizeQuote (FR-REC-001)", () => {
  it("adds the delivery charge into the total and derives a per-flyer price", () => {
    const n = normalizeQuote(baseQuote({ amountMin: "15000.00", deliveryCharge: "1500.00" }), {
      quantity: 300,
    });
    expect(n.totalMin).toBe(16500);
    expect(n.unitPriceMin).toBe(50); // 15000 / 300
    expect(n.priceBasis).toBe("fixed");
  });

  it("handles an estimate range", () => {
    const n = normalizeQuote(baseQuote({ amountMin: "15000", amountMax: "18000", fixed: false }), {
      quantity: 200,
    });
    expect(n.totalMax).toBe(18000);
    expect(n.unitPriceMax).toBe(90);
    expect(n.priceBasis).toBe("estimate");
  });

  it("skips the per-flyer price when the brief quantity is not a positive integer", () => {
    const n = normalizeQuote(baseQuote(), { quantity: "lots" });
    expect(n.quantity).toBeNull();
    expect(n.unitPriceMin).toBeNull();
  });
});
