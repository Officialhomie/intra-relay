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
  serviceSummary: "A5 and A4 flyer printing, full-colour or black-and-white.",
  serviceArea: "UNILAG campus and Akoka",
  operatingHours: "Mon–Sat, 9am–6pm",
  turnaround: "Same day if approved before noon",
  quoteResponseTime: "2h",
  quoteCurrency: "NGN",
  wantsPaidQueries: true,
  payoutAddress: `0x${"A".repeat(40)}`,
  consentToQuoteDisplay: true,
};

describe("buildOnboardingDraft", () => {
  it("creates a DRAFT route and business, never ACTIVE (AC-SUP-003, FR-ROUTE-004)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.route.status).toBe("DRAFT");
    expect(draft.business.status).toBe("DRAFT");
  });

  it("returns a business slug and a draft review URL (AC-SUP-002, FR-SUP-004)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.business.slug).toBe("campus-prints-ng");
    expect(draft.draftRouteUrl).toBe("/supplier/campus-prints-ng/review");
    expect(draft.route.endpoint).toContain("campus-prints-ng");
  });

  it("carries the flyer-printing route inputs and the merchant's own values (FR-SUP-005, FR-ROUTE-002)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.route.inputFields.map((field) => field.key)).toEqual([
      "size",
      "quantity",
      "colour",
      "deadline",
      "deliveryArea",
    ]);
    expect(draft.route.queryFeeUsd).toBe(0.02);
    // "2h" quote response time -> 120 minutes, not the raw template default.
    expect(draft.route.responseSlaMinutes).toBe(120);
    expect(draft.route.description).toBe(input.serviceSummary);
  });

  it("builds a plain-language Capability Card with what is public vs private", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.card.serviceArea).toBe("UNILAG campus and Akoka");
    expect(draft.card.operatingHours).toBe("Mon–Sat, 9am–6pm");
    expect(draft.card.turnaround).toBe("Same day if approved before noon");
    expect(draft.card.quoteResponseExpectation).toBe("Within 2 hours");
    expect(draft.card.queryFee.paid).toBe(true);
    expect(draft.card.publicToAgents.join(" ")).toMatch(/only after an operator activates/i);
    expect(draft.card.notPublic.join(" ")).toContain("Ada Obi");
  });

  it("normalises the payout address and does not persist (ADR-005, safety)", () => {
    const draft = buildOnboardingDraft(input);
    expect(draft.business.payoutAddress).toBe(`0x${"a".repeat(40)}`);
    expect(draft.route.payoutAddress).toBe(`0x${"a".repeat(40)}`);
    expect(draft.persistence).toBe("none");
  });

  it("makes a free route with no payout address when the merchant opts out of paid queries", () => {
    const draft = buildOnboardingDraft({
      ...input,
      wantsPaidQueries: false,
      payoutAddress: "",
    });
    expect(draft.business.payoutAddress).toBeNull();
    expect(draft.route.payoutAddress).toBeNull();
    expect(draft.route.queryFeeUsd).toBe(0);
    expect(draft.card.queryFee.paid).toBe(false);
  });
});
