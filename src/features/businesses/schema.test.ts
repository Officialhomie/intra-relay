import { describe, expect, it } from "vitest";

import { businessOnboardingSchema, type BusinessOnboardingInput } from "./schema";

const validInput: BusinessOnboardingInput = {
  businessName: "Campus Prints NG",
  contactName: "Ada Obi",
  contactChannelType: "whatsapp",
  contactChannelValue: "+2348012345678",
  category: "printing",
  city: "Lagos",
  country: "Nigeria",
  quoteCurrency: "NGN",
  payoutAddress: `0x${"a".repeat(40)}`,
  consentToQuoteDisplay: true,
};

function firstErrorPath(input: unknown): string | undefined {
  const result = businessOnboardingSchema.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues[0]?.path[0]?.toString();
}

describe("businessOnboardingSchema", () => {
  it("accepts a complete valid submission (FR-SUP-001)", () => {
    expect(businessOnboardingSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an invalid payout address (FR-SUP-002, AC-SUP-001)", () => {
    const result = businessOnboardingSchema.safeParse({
      ...validInput,
      payoutAddress: "0x123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "payoutAddress")).toBe(true);
    }
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

  it("rejects a missing business name", () => {
    expect(firstErrorPath({ ...validInput, businessName: "" })).toBe("businessName");
  });

  it("never defines a field for prohibited sensitive data (FR-SUP-003, NFR-SEC-001)", () => {
    const keys = Object.keys(businessOnboardingSchema.shape);
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
    ];
    for (const banned of prohibited) {
      expect(keys).not.toContain(banned);
    }
  });
});
