import { describe, expect, it } from "vitest";

import { buildTallyPayload } from "./__fixtures__/tally-payload";
import { normalizeTallySubmission } from "./normalize";

/**
 * Turning a raw Tally submission into a plain, typed shape (M10.1).
 *
 * Exercises both plausible Tally answer shapes for a choice question — an
 * option id resolved through the field's own `options` map (the realistic
 * case) and a bare selected-text value (the defensive fallback) — since
 * which one Tally actually sends is unconfirmed without a live submission.
 */

describe.each([
  ["option ids", true],
  ["bare text values", false],
] as const)("normalizing a submission that answers with %s", (_label, useOptionIds) => {
  it("reads identity, location, and logistics fields", () => {
    const { data, issues } = normalizeTallySubmission(
      buildTallyPayload({
        useOptionIds,
        businessName: "Yaba Prints",
        ownerContactName: "Ada Obi",
        whatsappNumber: "+2348012345678",
        city: "Lagos",
        serviceArea: "Yaba and Akoka",
        pickupAvailable: "Yes",
        deliveryAvailable: "No",
      }),
    );
    expect(issues).toHaveLength(0);
    expect(data.businessName).toBe("Yaba Prints");
    expect(data.ownerContactName).toBe("Ada Obi");
    expect(data.whatsappNumber).toBe("+2348012345678");
    expect(data.city).toBe("Lagos");
    expect(data.serviceArea).toBe("Yaba and Akoka");
    expect(data.pickupAvailable).toBe(true);
    expect(data.deliveryAvailable).toBe(false);
  });

  it("normalizes one selected service and its pricing group", () => {
    const { data, issues } = normalizeTallySubmission(
      buildTallyPayload({
        useOptionIds,
        services: [
          {
            label: "Flyers",
            pricingModel: "Fixed price",
            priceText: "N5,000 per 100",
            notes: "Min 100",
          },
        ],
      }),
    );
    expect(issues).toHaveLength(0);
    expect(data.services).toEqual([
      { label: "Flyers", pricingModel: "FIXED", priceText: "N5,000 per 100", notes: "Min 100" },
    ]);
  });

  it("normalizes multiple selected services independently (test scenario 11)", () => {
    const { data, issues } = normalizeTallySubmission(
      buildTallyPayload({
        useOptionIds,
        services: [
          { label: "Business cards", pricingModel: "Fixed price", priceText: "N5,000 per 100" },
          { label: "Banners", pricingModel: "Starting from a price", priceText: "N10,000" },
          { label: "Large-format printing", pricingModel: "I need to see the job first" },
        ],
      }),
    );
    expect(issues).toHaveLength(0);
    expect(data.services).toHaveLength(3);
    expect(data.services.map((s) => s.pricingModel)).toEqual([
      "FIXED",
      "STARTING_FROM",
      "QUOTE_REQUIRED",
    ]);
    expect(data.services[2].priceText).toBeNull();
  });

  it("treats a service outside the 14 named options as its own custom entry (test scenario 10)", () => {
    const { data, issues } = normalizeTallySubmission(
      buildTallyPayload({
        useOptionIds,
        services: [
          { label: "Canvas printing", pricingModel: "Starting from a price", priceText: "N8,000" },
        ],
      }),
    );
    expect(issues).toHaveLength(0);
    expect(data.services).toEqual([
      { label: "Canvas printing", pricingModel: "STARTING_FROM", priceText: "N8,000", notes: null },
    ]);
  });

  it("only reads a payout address when the business said they have a wallet (test scenario 7)", () => {
    const { data } = normalizeTallySubmission(
      buildTallyPayload({ useOptionIds, hasWallet: "Not yet", payoutAddress: null }),
    );
    expect(data.hasWallet).toBe(false);
    expect(data.payoutAddress).toBeNull();
  });

  it("reads consent only from the exact 'I agree' answer", () => {
    const agreed = normalizeTallySubmission(
      buildTallyPayload({ useOptionIds, consentGiven: true }),
    );
    const declined = normalizeTallySubmission(
      buildTallyPayload({ useOptionIds, consentGiven: false }),
    );
    expect(agreed.data.consentGiven).toBe(true);
    expect(declined.data.consentGiven).toBe(false);
  });
});

describe("normalizing an unrecognized answer", () => {
  it("flags an unrecognized pricing-model answer instead of guessing", () => {
    const payload = buildTallyPayload({
      services: [{ label: "Flyers", priceText: "N5,000" }],
    });
    // Corrupt the pricing-model field's own option map so its text doesn't
    // match any known model — simulates a stale label/option mismatch.
    const pricingField = payload.data.fields.find((f) => f.label === "How do you price Flyers?");
    pricingField!.options = [{ id: "opt-x", text: "Some other answer" }];
    pricingField!.value = "opt-x";

    const { data, issues } = normalizeTallySubmission(payload);
    expect(data.services[0].pricingModel).toBeNull();
    expect(issues.some((i) => i.field.includes("pricingModel"))).toBe(true);
  });

  it("flags an unrecognized reply-speed answer instead of guessing", () => {
    const payload = buildTallyPayload({});
    const field = payload.data.fields.find(
      (f) => f.label === "How quickly do you normally reply to a new request?",
    );
    field!.options = [{ id: "opt-x", text: "Whenever" }];
    field!.value = "opt-x";

    const { data, issues } = normalizeTallySubmission(payload);
    expect(data.responseTime).toBeNull();
    expect(issues.some((i) => i.field === "responseTime")).toBe(true);
  });
});
