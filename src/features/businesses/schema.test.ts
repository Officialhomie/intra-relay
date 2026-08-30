import { describe, expect, it } from "vitest";

import {
  businessOnboardingObject,
  businessOnboardingSchema,
  type BusinessOnboardingInput,
} from "./schema";

const validInput: BusinessOnboardingInput = {
  businessName: "Campus Prints NG",
  contactName: "Ada Obi",
  contactChannelType: "whatsapp",
  contactChannelValue: "+2348012345678",
  category: "printing",
  city: "Lagos",
  country: "Nigeria",
  serviceSummary: "A5 and A4 flyer printing, full-colour or black-and-white, bulk rates over 200.",
  serviceArea: "UNILAG campus and Akoka",
  operatingHours: "Mon–Sat, 9am–6pm",
  turnaround: "Same day if approved before noon",
  quoteResponseTime: "2h",
  quoteCurrency: "NGN",
  wantsPaidQueries: true,
  payoutAddress: `0x${"a".repeat(40)}`,
  consentToQuoteDisplay: true,
};

function firstErrorPath(input: unknown): string | undefined {
  const result = businessOnboardingSchema.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues[0]?.path[0]?.toString();
}

describe("businessOnboardingSchema", () => {
  it("accepts a complete valid submission (FR-SUP-001, FR-SUP-005)", () => {
    expect(businessOnboardingSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an invalid payout address when paid queries are enabled (FR-SUP-002, AC-SUP-001)", () => {
    const result = businessOnboardingSchema.safeParse({
      ...validInput,
      payoutAddress: "0x123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "payoutAddress")).toBe(true);
    }
  });

  it("does not require a payout address when the merchant opts out of paid queries", () => {
    const result = businessOnboardingSchema.safeParse({
      ...validInput,
      wantsPaidQueries: false,
      payoutAddress: "",
    });
    expect(result.success).toBe(true);
  });

  it("requires explicit quote-display consent (FR-SUP-002)", () => {
    const result = businessOnboardingSchema.safeParse({
      ...validInput,
      consentToQuoteDisplay: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "consentToQuoteDisplay")).toBe(
        true,
      );
    }
  });

  it("requires the new service-capability fields (FR-SUP-005)", () => {
    expect(firstErrorPath({ ...validInput, serviceArea: "" })).toBe("serviceArea");
    expect(firstErrorPath({ ...validInput, operatingHours: "" })).toBe("operatingHours");
    expect(firstErrorPath({ ...validInput, turnaround: "" })).toBe("turnaround");
    expect(firstErrorPath({ ...validInput, serviceSummary: "short" })).toBe("serviceSummary");
  });

  it("rejects a missing business name", () => {
    expect(firstErrorPath({ ...validInput, businessName: "" })).toBe("businessName");
  });

  it("never defines a field for prohibited sensitive data or a street address (FR-SUP-003, NFR-SEC-001)", () => {
    const keys = Object.keys(businessOnboardingObject.shape);
    const prohibited = [
      "seedPhrase",
      "mnemonic",
      "privateKey",
      "password",
      "pin",
      "bvn",
      "nin",
      "idNumber",
      "card",
      "cardNumber",
      "cvv",
      "bankPassword",
      "bankLogin",
      "streetAddress",
      "homeAddress",
      "addressLine1",
    ];
    for (const banned of prohibited) {
      expect(keys).not.toContain(banned);
    }
  });
});
