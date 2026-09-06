// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { quoteRoutes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildBusinessCapabilities } from "@/features/routes/capability";

import {
  quickStartBusiness,
  quickStartObject,
  quickStartSchema,
  WHY_BUSINESSES_JOIN,
} from "./quick-start";
import { findBusinessBySlug } from "./repository";

/**
 * One-screen business setup (milestone 5 §4, §8).
 *
 * The point of this flow is that a business exists after answering a handful of
 * questions. The point of these tests is that "faster" did not become "looser":
 * the operator gate, the consent record, and the no-secrets rule all still hold.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const MINIMAL = {
  businessName: "Yaba Reprographics",
  category: "printing" as const,
  serviceName: "Flyer printing",
  pricingModel: "STARTING_FROM" as const,
  priceAmount: 15_000,
  priceUnit: "per 100",
  quoteCurrency: "NGN" as const,
  serviceArea: "Yaba and Akoka",
  city: "Lagos",
  country: "Nigeria",
  contactName: "Tolu",
  contactChannelValue: "+2348012345678",
  consentToQuoteDisplay: true,
};

describe("setting a business up in one step", () => {
  it("creates the business and its first service together", async () => {
    const result = await quickStartBusiness(db, MINIMAL);

    expect(result.business.slug).toBe("yaba-reprographics");
    expect(result.business.name).toBe("Yaba Reprographics");
    expect(result.route.name).toBe("Flyer printing");
    expect(result.route.pricingModel).toBe("STARTING_FROM");
    expect(result.route.priceAmount).toBe("15000.00");
    expect(result.route.priceUnit).toBe("per 100");
  });

  it("still requires an operator before customers can reach them", async () => {
    const result = await quickStartBusiness(db, MINIMAL);
    // Faster setup must not mean an unchecked business going live (BR-002).
    expect(result.business.status).toBe("PENDING_VERIFICATION");
    expect(result.business.verifiedByOperatorAt).toBeNull();
    expect(result.route.status).toBe("DRAFT");
    expect(result.nextStep).toMatch(/operator checks your details/i);
  });

  it("records consent at the moment it is given", async () => {
    const result = await quickStartBusiness(db, MINIMAL);
    expect(result.business.consentAt).not.toBeNull();
  });

  it("does not ask for a payout address on day one", async () => {
    const result = await quickStartBusiness(db, MINIMAL);
    // Paid agent queries are opt-in later; nothing about them blocks setup.
    expect(result.route.queryFeeUsd).toBe("0.0000");
    expect(Object.keys(quickStartObject.shape)).not.toContain("payoutAddress");
  });

  it("asks for nothing prohibited (NFR-SEC-001)", () => {
    const fields = Object.keys(quickStartObject.shape).map((k) => k.toLowerCase());
    for (const banned of [
      "seed",
      "mnemonic",
      "privatekey",
      "password",
      "bvn",
      "nin",
      "card",
      "cvv",
      "bank",
    ]) {
      expect(fields.some((f) => f.includes(banned))).toBe(false);
    }
  });

  it("hands back a private link the business can get back in with", async () => {
    const result = await quickStartBusiness(db, MINIMAL);
    const stored = await findBusinessBySlug(db, result.business.slug);
    expect(result.manageUrl).toBe(`/supplier/yaba-reprographics?t=${stored!.manageToken}`);
  });

  it("refuses a duplicate business rather than shadowing the first", async () => {
    await quickStartBusiness(db, MINIMAL);
    await expect(quickStartBusiness(db, MINIMAL)).rejects.toMatchObject({
      code: "BUSINESS_EXISTS",
    });
  });

  it("refuses a name that cannot become a web address", async () => {
    await expect(quickStartBusiness(db, { ...MINIMAL, businessName: "!!!" })).rejects.toMatchObject(
      { code: "INVALID_NAME" },
    );
  });
});

describe("the three commercial models all come out of the same flow", () => {
  it("supports a set price", async () => {
    const result = await quickStartBusiness(db, {
      ...MINIMAL,
      businessName: "UNILAG Copy Centre",
      serviceName: "Document copying",
      pricingModel: "FIXED",
      priceAmount: 50,
      priceUnit: "per page",
    });
    expect(result.route.pricingModel).toBe("FIXED");
    expect(result.route.priceAmount).toBe("50.00");
  });

  it("supports a per-job service with no published price", async () => {
    const result = await quickStartBusiness(db, {
      ...MINIMAL,
      businessName: "Surulere Device Repair",
      category: "other",
      serviceName: "Device repair",
      pricingModel: "QUOTE_REQUIRED",
      priceAmount: null,
      priceUnit: null,
    });
    expect(result.route.pricingModel).toBe("QUOTE_REQUIRED");
    expect(result.route.priceAmount).toBeNull();
  });

  it("insists on an amount when the model has one", () => {
    const parsed = quickStartSchema.safeParse({
      ...MINIMAL,
      pricingModel: "FIXED",
      priceAmount: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects incomplete setup with a message a person can act on", () => {
    const parsed = quickStartSchema.safeParse({
      ...MINIMAL,
      businessName: "",
      contactChannelValue: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages.join(" ")).toMatch(/Enter your business name|WhatsApp number/);
      expect(messages.join(" ")).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });

  it("will not set up a business that has not agreed to its prices being shown", () => {
    expect(quickStartSchema.safeParse({ ...MINIMAL, consentToQuoteDisplay: false }).success).toBe(
      false,
    );
  });
});

describe("what the new service publishes", () => {
  it("puts the pricing on the capability document once it exists", async () => {
    const result = await quickStartBusiness(db, MINIMAL);
    // Make it live the way an operator would, so the document is complete.
    await db
      .update(quoteRoutes)
      .set({ status: "ACTIVE", verifiedAt: new Date(), priceUpdatedAt: new Date() })
      .where(eq(quoteRoutes.id, result.route.id));

    const doc = await buildBusinessCapabilities(db, result.business.slug);
    const service = doc!.routes[0];
    expect(service.pricing.model).toBe("STARTING_FROM");
    expect(service.pricing.summary).toBe("From NGN 15,000 per 100");
    expect(service.pricing.comparable).toBe(false);
    expect(service.pricing.caveat).toMatch(/quote they send/i);
  });
});

describe("the case made to a business", () => {
  it("promises only things the product actually does", () => {
    const text = WHY_BUSINESSES_JOIN.map((r) => `${r.title} ${r.body}`).join(" ");
    expect(WHY_BUSINESSES_JOIN.length).toBeGreaterThanOrEqual(3);
    // No unverifiable growth claims (§8).
    expect(text).not.toMatch(/more customers|grow your|increase your sales|guaranteed/i);
    // And the integrity promise is stated, because it is one we keep.
    expect(text).toMatch(/agreed price stays agreed|cannot change underneath/i);
  });
});
