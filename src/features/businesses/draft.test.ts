import { describe, expect, it } from "vitest";

import { buildOnboardingDraft } from "./draft";
import type { BusinessOnboardingInput } from "./schema";

const input: BusinessOnboardingInput = {
  businessName: "Campus Prints NG",
  contactName: "Ada Obi",
  contactChannelType: "whatsapp",
  contactChannelValue: "+2348012345678",
  category: "printing",
  city: "Lagos",
  country: "Nigeria",
  quoteCurrency: "NGN",
  payoutAddress: `0x${"A".repeat(40)}`,
  consentToQuoteDisplay: true,
};

describe("buildOnboardingDraft", () => {
  it("creates a DRAFT route and business, never ACTIVE (AC-SUP-003, FR-ROUTE-004)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.route.status).toBe("DRAFT");
    expect(draft.business.status).toBe("DRAFT");
  });

  it("returns a business slug and a draft route URL (AC-SUP-002, FR-SUP-004)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.business.slug).toBe("campus-prints-ng");
    expect(draft.draftRouteUrl).toBe("/supplier/campus-prints-ng/review");
    expect(draft.route.endpoint).toContain("campus-prints-ng");
  });

  it("carries the flyer-printing route inputs and fee (FR-SUP-005, FR-ROUTE-002)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.route.inputFields.map((field) => field.key)).toEqual([
      "size",
      "quantity",
      "colour",
      "deadline",
      "deliveryArea",
    ]);
    expect(draft.route.queryFeeUsd).toBe(0.02);
    expect(draft.route.responseSlaMinutes).toBe(30);
  });

  it("normalises the payout address and does not persist (ADR-005, safety)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.business.payoutAddress).toBe(`0x${"a".repeat(40)}`);
    expect(draft.route.payoutAddress).toBe(`0x${"a".repeat(40)}`);
    expect(draft.persistence).toBe("none");
  });
});
