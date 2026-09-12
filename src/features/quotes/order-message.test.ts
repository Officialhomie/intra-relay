import { describe, expect, it } from "vitest";

import type { BusinessRow, QuoteRow, TaskRow } from "@/lib/db/schema";

import { buildOrderMessage } from "./order-message";
import { buildRecommendationSummary } from "./recommendation";

const business = { name: "Campus Prints NG" } as BusinessRow;
const task = {
  structuredInput: { size: "A5", quantity: 200, colour: "full-colour", deadline: "Friday 3pm" },
} as unknown as TaskRow;
const quote = {
  amountMin: "15000.00",
  amountMax: "18000.00",
  currency: "NGN",
  turnaround: "same day",
  assumptions: "Design supplied print-ready",
  confidence: "medium",
  fixed: false,
} as QuoteRow;

describe("buildOrderMessage (FR-REC-002)", () => {
  const message = buildOrderMessage(business, task, quote);

  it("addresses the business and includes the brief and the quoted range", () => {
    expect(message).toContain("Campus Prints NG");
    expect(message).toContain("NGN 15000.00–18000.00");
  });

  it("renders the brief in plain language, never raw keys or hyphenated values", () => {
    expect(message).toContain("Paper size: A5");
    expect(message).toContain("How many: 200");
    expect(message).toContain("Colour: Full colour");
    expect(message).toContain("Needed by: Friday 3pm");
    expect(message).not.toContain("- size:");
    expect(message).not.toContain("- deliveryArea:");
    expect(message).not.toContain("full-colour");
  });

  it("asks the buyer to confirm before approving — it is never auto-sent", () => {
    expect(message).toMatch(/Please confirm .* so I can approve the order/i);
  });

  it("labels an estimate vs a fixed price", () => {
    expect(buildOrderMessage(business, task, quote)).toContain("estimate");
    expect(buildOrderMessage(business, task, { ...quote, fixed: true })).toContain("fixed price");
  });

  it("adds a reconfirm-the-price caveat when the accepted quote had expired", () => {
    const expiredMsg = buildOrderMessage(business, task, quote, { expired: true });
    expect(expiredMsg).toMatch(/passed its stated expiry/i);
    expect(buildOrderMessage(business, task, quote, { expired: false })).not.toMatch(/expiry/i);
  });
});

describe("buildRecommendationSummary (FR-REC-001)", () => {
  it("summarises the quote and states it is not independently verified", () => {
    const summary = buildRecommendationSummary(quote);
    expect(summary).toContain("NGN 15000.00–18000.00");
    expect(summary).toMatch(/not independently verified/i);
    expect(summary).toMatch(/estimate/i);
  });
});
