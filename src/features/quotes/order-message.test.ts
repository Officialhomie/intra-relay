import { describe, expect, it } from "vitest";

import type { BusinessRow, QuoteRow, TaskRow } from "@/lib/db/schema";

import { buildOrderMessage, buildRationale } from "./order-message";

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
    expect(message).toContain("size: A5");
    expect(message).toContain("NGN 15000.00–18000.00");
  });

  it("asks the buyer to confirm before approving — it is never auto-sent", () => {
    expect(message).toMatch(/Please confirm .* so I can approve the order/i);
  });

  it("labels an estimate vs a fixed price", () => {
    expect(buildOrderMessage(business, task, quote)).toContain("estimate");
    expect(buildOrderMessage(business, task, { ...quote, fixed: true })).toContain("fixed price");
  });
});

describe("buildRationale (FR-REC-001)", () => {
  it("summarises the quote and reminds the buyer to confirm before paying", () => {
    const rationale = buildRationale(quote);
    expect(rationale).toContain("NGN 15000.00");
    expect(rationale).toMatch(/confirm the final price/i);
  });
});
