// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { createBusiness } from "@/features/businesses/service";
import { businessInput, VALID_ADDRESS } from "@/test-support/factories";

import { buildTallyPayload } from "./__fixtures__/tally-payload";
import { normalizeTallySubmission } from "./normalize";
import { validateNormalizedOnboarding } from "./validate";

/**
 * Validation rules for a normalized onboarding submission (M10.1 §9).
 *
 * Two severities: a blocking issue means no business is created at all
 * (`NEEDS_REVIEW`); a warning lets a `DRAFT` business+route through, since a
 * `DRAFT` route can never be quoted to a buyer until an operator activates it.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

async function validate(payload = buildTallyPayload()) {
  const { data, issues } = normalizeTallySubmission(payload);
  return validateNormalizedOnboarding(db, data, issues);
}

describe("a complete, valid submission", () => {
  it("has no blocking issues and resolves a slug", async () => {
    const result = await validate();
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.slug).toBe("yaba-prints");
    expect(result.possibleDuplicate).toBeNull();
  });
});

describe("missing required information (test scenario 5)", () => {
  it("blocks on a missing business name, contact, or location", async () => {
    const result = await validate(
      buildTallyPayload({ businessName: null, whatsappNumber: null, city: null }),
    );
    const fields = result.blockingIssues.map((i) => i.field);
    expect(fields).toContain("businessName");
    expect(fields).toContain("whatsappNumber");
    expect(fields).toContain("city");
  });

  it("blocks when consent was not given", async () => {
    const result = await validate(buildTallyPayload({ consentGiven: false }));
    expect(result.blockingIssues.some((i) => i.field === "consentGiven")).toBe(true);
  });

  it("blocks when no service was selected", async () => {
    const result = await validate(buildTallyPayload({ services: [] }));
    expect(result.blockingIssues.some((i) => i.field === "services")).toBe(true);
  });
});

describe("pricing model coverage (test scenarios 2, 3, 4, 12)", () => {
  it("does not block FIXED, STARTING_FROM, or QUOTE_REQUIRED pricing on their own", async () => {
    const result = await validate(
      buildTallyPayload({
        services: [
          { label: "Business cards", pricingModel: "Fixed price", priceText: "N5,000 per 100" },
          { label: "Banners", pricingModel: "Starting from a price", priceText: "N10,000" },
          { label: "Large-format printing", pricingModel: "I need to see the job first" },
        ],
      }),
    );
    expect(result.blockingIssues).toHaveLength(0);
  });

  it("warns, but does not block, a FIXED/STARTING_FROM service with no price text", async () => {
    const result = await validate(
      buildTallyPayload({
        services: [{ label: "Business cards", pricingModel: "Fixed price", priceText: undefined }],
      }),
    );
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.warnings.some((i) => i.field.includes("priceText"))).toBe(true);
  });

  it("never requires price text for QUOTE_REQUIRED (§7 — no fake price)", async () => {
    const result = await validate(
      buildTallyPayload({
        services: [{ label: "Large-format printing", pricingModel: "I need to see the job first" }],
      }),
    );
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("payout address (test scenarios 6, 7)", () => {
  it("does not block when no wallet was offered", async () => {
    const result = await validate(buildTallyPayload({ hasWallet: "Not yet", payoutAddress: null }));
    expect(result.blockingIssues.some((i) => i.field === "payoutAddress")).toBe(false);
  });

  it("blocks a malformed address", async () => {
    const result = await validate(
      buildTallyPayload({ hasWallet: "Yes", payoutAddress: "not-an-address" }),
    );
    expect(result.blockingIssues.some((i) => i.field === "payoutAddress")).toBe(true);
  });

  it("blocks the zero address rather than silently treating it as 'no wallet'", async () => {
    const result = await validate(
      buildTallyPayload({
        hasWallet: "Yes",
        payoutAddress: "0x0000000000000000000000000000000000000000",
      }),
    );
    expect(result.blockingIssues.some((i) => i.field === "payoutAddress")).toBe(true);
  });

  it("blocks saying yes to a wallet but leaving the address blank", async () => {
    const result = await validate(buildTallyPayload({ hasWallet: "Yes", payoutAddress: null }));
    expect(result.blockingIssues.some((i) => i.field === "payoutAddress")).toBe(true);
  });

  it("accepts a valid public address", async () => {
    const result = await validate(
      buildTallyPayload({ hasWallet: "Yes", payoutAddress: VALID_ADDRESS }),
    );
    expect(result.blockingIssues.some((i) => i.field === "payoutAddress")).toBe(false);
  });
});

describe("likely duplicate business (test scenario 9)", () => {
  it("blocks when the business name resolves to an existing slug", async () => {
    await createBusiness(db, businessInput({ businessName: "Yaba Prints" }));
    const result = await validate(buildTallyPayload({ businessName: "Yaba Prints" }));
    expect(result.possibleDuplicate).not.toBeNull();
    expect(result.blockingIssues.some((i) => i.field === "businessName")).toBe(true);
  });

  it("blocks when the WhatsApp number matches an existing business, even under a new name", async () => {
    await createBusiness(
      db,
      businessInput({ businessName: "Original Prints", contactChannelValue: "+2348012345678" }),
    );
    const result = await validate(
      buildTallyPayload({
        businessName: "Totally Different Name",
        whatsappNumber: "+2348012345678",
      }),
    );
    expect(result.possibleDuplicate).not.toBeNull();
    expect(result.possibleDuplicate?.reason).toMatch(/whatsapp/i);
  });

  it("does not flag two different businesses with no overlap", async () => {
    await createBusiness(
      db,
      businessInput({ businessName: "Some Other Business", contactChannelValue: "+2347000000000" }),
    );
    const result = await validate(buildTallyPayload({ businessName: "Yaba Prints" }));
    expect(result.possibleDuplicate).toBeNull();
  });
});
