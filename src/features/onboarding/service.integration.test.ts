// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents } from "@/lib/db/schema";
import { createBusiness } from "@/features/businesses/service";
import {
  businessInput,
  FULL_CHECKLIST,
  TEST_OPERATOR,
  VALID_ADDRESS,
} from "@/test-support/factories";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import { changeRouteStatus } from "@/features/routes/service";

import { buildTallyPayload, DEFAULT_FORM_ID } from "./__fixtures__/tally-payload";
import { processTallySubmission } from "./service";
import { findOnboardingSubmissionByTallyId } from "./repository";

const auditEventsFor = (businessId: string) =>
  db.select().from(auditEvents).where(eq(auditEvents.businessId, businessId));

/**
 * The end-to-end Tally -> Intra onboarding pipeline (M10.1, ADR-024).
 *
 * Covers the M10.1 brief's 17 test scenarios, split across this file and
 * `normalize.test.ts` / `validate.integration.test.ts` (field-level rules)
 * and `../../app/api/onboarding/tally/route.integration.test.ts` (the HTTP
 * boundary: signature, unknown form id, malformed payloads). This file is
 * the pipeline itself: what a verified, shape-valid webhook delivery does.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const process = (payload: ReturnType<typeof buildTallyPayload>) =>
  processTallySubmission(db, payload, DEFAULT_FORM_ID);

describe("a valid printer onboarding submission (test scenarios 1, 15)", () => {
  it("creates a real business and a DRAFT route, never buyer-facing yet", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Yaba Prints",
        services: [{ label: "Flyers", pricingModel: "Fixed price", priceText: "N5,000 per 100" }],
      }),
    );

    expect(result.status).toBe("PROCESSED");
    expect(result.business).not.toBeNull();
    expect(result.business!.slug).toBe("yaba-prints");
    expect(result.business!.category).toBe("printing");
    expect(result.business!.status).toBe("PENDING_VERIFICATION");
    expect(result.route).not.toBeNull();
    expect(result.route!.status).toBe("DRAFT");
  });

  it("never needs the business to visit the Intra website or create an account", async () => {
    // The whole pipeline runs from one webhook call with no follow-up action
    // required from the business — there is no signup step anywhere here.
    const result = await process(buildTallyPayload({ businessName: "No Portal Prints" }));
    expect(result.status).toBe("PROCESSED");
  });

  it("records an audit trail an operator can see without re-entering anything", async () => {
    const result = await process(buildTallyPayload({ businessName: "Audited Prints" }));
    const events = await auditEventsFor(result.business!.id);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["business.created", "onboarding.created"]),
    );
  });
});

describe("pricing models carried through to the route (test scenarios 2, 3, 4)", () => {
  it("FIXED pricing creates a DRAFT route with no fabricated structured price", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Fixed Price Prints",
        services: [
          { label: "Business cards", pricingModel: "Fixed price", priceText: "N5,000 per 100" },
        ],
      }),
    );
    expect(result.status).toBe("PROCESSED");
    // The free-text price is never parsed into `priceAmount` — that stays the
    // operator's job via the existing pricing-update flow (§7).
    expect(result.route!.priceAmount).toBeNull();
  });

  it("STARTING_FROM pricing also creates a DRAFT route without a guessed amount", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Starting From Prints",
        services: [
          { label: "Banners", pricingModel: "Starting from a price", priceText: "N10,000" },
        ],
      }),
    );
    expect(result.status).toBe("PROCESSED");
    expect(result.route!.priceAmount).toBeNull();
  });

  it("QUOTE_REQUIRED pricing never requires or invents a price", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Quote Required Prints",
        services: [{ label: "Large-format printing", pricingModel: "I need to see the job first" }],
      }),
    );
    expect(result.status).toBe("PROCESSED");
    expect(result.issues).toHaveLength(0);
  });
});

describe("missing required information (test scenarios 5, 16)", () => {
  it("goes to NEEDS_REVIEW and creates no business at all", async () => {
    const result = await process(buildTallyPayload({ businessName: null, whatsappNumber: null }));
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.business).toBeNull();
    expect(result.route).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("stores the issues on the submission row for an operator to see, without re-asking Tally", async () => {
    const payload = buildTallyPayload({ businessName: null, submissionId: "sub-needs-review-1" });
    const result = await process(payload);
    const stored = await findOnboardingSubmissionByTallyId(db, "sub-needs-review-1");
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("NEEDS_REVIEW");
    expect(stored!.issues).toEqual(result.issues);
    expect(stored!.issues!.some((i) => i.field === "businessName")).toBe(true);
  });
});

describe("payout address (test scenarios 6, 7)", () => {
  it("rejects an invalid payout address into NEEDS_REVIEW rather than inventing one", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Bad Wallet Prints",
        hasWallet: "Yes",
        payoutAddress: "nope",
      }),
    );
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.business).toBeNull();
  });

  it("onboards a business with no wallet using the established off-chain sentinel, never a fake address", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "No Wallet Yet Prints",
        hasWallet: "Not yet",
        payoutAddress: null,
      }),
    );
    expect(result.status).toBe("PROCESSED");
    expect(result.business!.payoutAddress).toBe(OFF_CHAIN_ASSET);
  });

  it("uses a real payout address when one is provided", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Has Wallet Prints",
        hasWallet: "Yes",
        payoutAddress: VALID_ADDRESS,
      }),
    );
    expect(result.status).toBe("PROCESSED");
    expect(result.business!.payoutAddress.toLowerCase()).toBe(VALID_ADDRESS.toLowerCase());
  });
});

describe("duplicate Tally submission (test scenarios 8, 17)", () => {
  it("replaying the identical webhook delivery creates nothing a second time", async () => {
    const payload = buildTallyPayload({
      businessName: "Replay Prints",
      submissionId: "sub-replay-1",
    });

    const first = await process(payload);
    const second = await process(payload);

    expect(first.status).toBe("PROCESSED");
    expect(second.status).toBe("REPLAYED");
    expect(second.business!.id).toBe(first.business!.id);
    expect(second.route!.id).toBe(first.route!.id);

    const events = await auditEventsFor(first.business!.id);
    expect(events.filter((e) => e.type === "business.created")).toHaveLength(1);
  });

  it("replaying a submission that needed review still returns the same review outcome", async () => {
    const payload = buildTallyPayload({ businessName: null, submissionId: "sub-replay-2" });
    const first = await process(payload);
    const second = await process(payload);
    expect(first.status).toBe("NEEDS_REVIEW");
    expect(second.status).toBe("REPLAYED");
    expect(second.business).toBeNull();
  });
});

describe("likely duplicate business (test scenario 9)", () => {
  it("does not create a second business for the same WhatsApp number", async () => {
    await createBusiness(
      db,
      businessInput({ businessName: "Existing Prints", contactChannelValue: "+2348099999999" }),
    );
    const result = await process(
      buildTallyPayload({ businessName: "New Name Same Number", whatsappNumber: "+2348099999999" }),
    );
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.business).toBeNull();
  });
});

describe("unsupported / custom service (test scenario 10)", () => {
  it("onboards a service outside the 14 named options under its own label", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Canvas Prints",
        services: [
          { label: "Canvas printing", pricingModel: "Starting from a price", priceText: "N8,000" },
        ],
      }),
    );
    expect(result.status).toBe("PROCESSED");
  });
});

describe("multiple services and multiple pricing models together (test scenarios 11, 12; M10.6)", () => {
  it("onboards a business offering several services under different pricing models", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Multi Service Prints",
        services: [
          { label: "Business cards", pricingModel: "Fixed price", priceText: "N5,000 per 100" },
          { label: "Banners", pricingModel: "Starting from a price", priceText: "N10,000" },
          { label: "Large-format printing", pricingModel: "I need to see the job first" },
        ],
      }),
    );
    expect(result.status).toBe("PROCESSED");
    // The route now genuinely represents all three products (M10.6) rather
    // than silently creating a single generic route and discarding the rest.
    const productTypeField = (
      result.route!.inputSchema as { key: string; options?: string[] }[]
    ).find((f) => f.key === "productType");
    expect(productTypeField?.options).toEqual(
      expect.arrayContaining(["business_cards", "banners", "large_format"]),
    );
    // Disagreeing pricing models can't all live on one route.pricingModel —
    // the route falls back to the honest QUOTE_REQUIRED rather than guessing
    // FIXED or STARTING_FROM, and this is now surfaced for an operator to see
    // (previously silently dropped — that was the exact gap this milestone closes).
    expect(result.route!.pricingModel).toBe("QUOTE_REQUIRED");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toMatch(/different pricing models/i);
  });

  it("services that unanimously agree on a pricing model set the route to that model", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Same Price Prints",
        services: [
          { label: "Flyers", pricingModel: "Starting from a price", priceText: "N15,000" },
          { label: "Posters", pricingModel: "Starting from a price", priceText: "N20,000" },
        ],
      }),
    );
    expect(result.status).toBe("PROCESSED");
    expect(result.route!.pricingModel).toBe("STARTING_FROM");
    expect(result.issues).toHaveLength(0);
  });
});

describe("the route's productType options faithfully represent what was submitted (M10.6)", () => {
  it("a single-service submission still gets a productType field with its one product", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Solo Flyer Prints",
        services: [
          { label: "Flyers", pricingModel: "Starting from a price", priceText: "N15,000" },
        ],
      }),
    );
    const productTypeField = (
      result.route!.inputSchema as { key: string; options?: string[]; required: boolean }[]
    ).find((f) => f.key === "productType");
    expect(productTypeField).toMatchObject({ options: ["flyers"], required: false });
  });

  it("a free-text 'Other' service is flagged for operator review, not fabricated into a product type", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Canvas Prints Two",
        services: [
          { label: "Canvas printing", pricingModel: "Starting from a price", priceText: "N8,000" },
        ],
      }),
    );
    const productTypeField = (
      result.route!.inputSchema as { key: string; options?: string[] }[]
    ).find((f) => f.key === "productType");
    expect(productTypeField?.options).toEqual([]);
    expect(result.issues.some((i) => i.message.includes("Canvas printing"))).toBe(true);
  });

  it("the route stays DRAFT after enrichment — activation is untouched", async () => {
    const result = await process(buildTallyPayload({ businessName: "Draft Check Prints" }));
    expect(result.route!.status).toBe("DRAFT");
  });
});

describe("fulfilment/location/turnaround data promoted onto the route (M10.8)", () => {
  it("promotes service area, pickup, delivery, and typical turnaround as submitted", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Promoted Data Prints",
        serviceArea: "Yaba and Akoka",
        pickupAvailable: "Yes",
        deliveryAvailable: "No",
        turnaround: "3 working days",
      }),
    );
    expect(result.route!.serviceArea).toBe("Yaba and Akoka");
    expect(result.route!.pickupAvailable).toBe(true);
    expect(result.route!.deliveryAvailable).toBe(false);
    expect(result.route!.typicalTurnaround).toBe("3 working days");
  });

  it("keeps an unanswered pickup/delivery/turnaround question as UNKNOWN (null), never coerced to false", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Unanswered Fields Prints",
        pickupAvailable: null,
        deliveryAvailable: null,
        turnaround: null,
      }),
    );
    expect(result.route!.pickupAvailable).toBeNull();
    expect(result.route!.deliveryAvailable).toBeNull();
    expect(result.route!.typicalTurnaround).toBeNull();
    // Explicit, since `null` and `false` both look "falsy" — this is the exact
    // mistake M10.8 Part E forbids.
    expect(result.route!.pickupAvailable).not.toBe(false);
    expect(result.route!.deliveryAvailable).not.toBe(false);
  });

  it("records an explicit 'No' as false — distinct from never having answered", async () => {
    const result = await process(
      buildTallyPayload({
        businessName: "Explicit No Prints",
        pickupAvailable: "No",
        deliveryAvailable: "No",
      }),
    );
    expect(result.route!.pickupAvailable).toBe(false);
    expect(result.route!.deliveryAvailable).toBe(false);
  });

  it("survives a webhook replay unchanged (idempotency untouched by the new fields)", async () => {
    const payload = buildTallyPayload({
      businessName: "Replay Promoted Prints",
      submissionId: "sub-replay-promoted-1",
      serviceArea: "Surulere",
      turnaround: "Same day",
    });
    const first = await process(payload);
    const second = await process(payload);
    expect(second.status).toBe("REPLAYED");
    expect(second.route!.serviceArea).toBe(first.route!.serviceArea);
    expect(second.route!.typicalTurnaround).toBe(first.route!.typicalTurnaround);
  });
});

describe("the resulting route reaching pilot-ready", () => {
  it("an operator can activate a route born from Tally onboarding like any other route", async () => {
    const result = await process(buildTallyPayload({ businessName: "Pilot Ready Prints" }));
    await changeRouteStatus(db, result.route!.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    const activated = await changeRouteStatus(
      db,
      result.route!.id,
      "ACTIVE",
      { operator: TEST_OPERATOR },
      FULL_CHECKLIST,
    );
    expect(activated.status).toBe("ACTIVE");
  });
});

describe("unknown form id (test scenario 14)", () => {
  it("refuses to process a webhook for a different form", async () => {
    const payload = buildTallyPayload({ formId: "some-other-form" });
    await expect(processTallySubmission(db, payload, DEFAULT_FORM_ID)).rejects.toMatchObject({
      code: "UNKNOWN_FORM_ID",
    });
  });
});
