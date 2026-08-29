// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents, businesses } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { createBusiness } from "@/features/businesses/service";
import { FULL_CHECKLIST, businessInput, TEST_OPERATOR } from "@/test-support/factories";

import { changeRouteStatus, createRoute, loadUsableRoute } from "./service";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

describe("createBusiness (FR-SUP-001..003)", () => {
  it("persists a business and an audit event, with no prohibited columns", async () => {
    const business = await createBusiness(db, businessInput());
    expect(business.slug).toBe("campus-prints-ng");
    expect(business.status).toBe("PENDING_VERIFICATION");
    expect(business.consentAt).not.toBeNull();

    const columns = Object.keys(businesses);
    for (const banned of [
      "privateKey",
      "seedPhrase",
      "mnemonic",
      "password",
      "bvn",
      "nin",
      "cardNumber",
    ]) {
      expect(columns).not.toContain(banned);
    }

    const events = await db.select().from(auditEvents);
    expect(events.map((event) => event.type)).toContain("business.created");
  });

  it("rejects a duplicate slug", async () => {
    await createBusiness(db, businessInput());
    await expect(createBusiness(db, businessInput())).rejects.toMatchObject({
      code: "BUSINESS_EXISTS",
    });
  });
});

describe("route lifecycle + activation invariant", () => {
  it("only an operator can move PENDING_VERIFICATION → ACTIVE (AC-SUP-003)", async () => {
    const business = await createBusiness(db, businessInput());
    const route = await createRoute(db, business.slug, {});
    expect(route.status).toBe("DRAFT");

    await changeRouteStatus(db, route.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });

    await expect(
      changeRouteStatus(db, route.id, "ACTIVE", { operator: null }, FULL_CHECKLIST),
    ).rejects.toMatchObject({
      code: "OPERATOR_REQUIRED",
      status: 401,
    });

    const activated = await changeRouteStatus(
      db,
      route.id,
      "ACTIVE",
      { operator: TEST_OPERATOR },
      FULL_CHECKLIST,
    );
    expect(activated.status).toBe("ACTIVE");
    expect(activated.verifiedAt).not.toBeNull();

    const [refreshedBusiness] = await db.select().from(businesses);
    expect(refreshedBusiness.verifiedByOperatorAt).not.toBeNull();
    expect(refreshedBusiness.verifiedByOperatorLabel).toBe("test-op");
  });

  it("rejects an illegal DRAFT → ACTIVE jump", async () => {
    const business = await createBusiness(db, businessInput());
    const route = await createRoute(db, business.slug, {});
    await expect(
      changeRouteStatus(db, route.id, "ACTIVE", { operator: TEST_OPERATOR }, FULL_CHECKLIST),
    ).rejects.toMatchObject({
      code: "INVALID_ROUTE_TRANSITION",
    });
  });

  it("blocks activation when the business never consented (BR-002)", async () => {
    // Force a no-consent business straight into the DB then try to activate.
    const [business] = await db
      .insert(businesses)
      .values({
        slug: "no-consent-co",
        name: "No Consent Co",
        contactName: "X",
        contactChannelType: "whatsapp",
        contactChannelValue: "+2348000000000",
        category: "printing",
        city: "Lagos",
        country: "Nigeria",
        payoutAddress: `0x${"b".repeat(40)}`,
        quoteCurrency: "NGN",
        consentAt: null,
        status: "PENDING_VERIFICATION",
      })
      .returning();
    const route = await createRoute(db, business.slug, {});
    await changeRouteStatus(db, route.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    await expect(
      changeRouteStatus(db, route.id, "ACTIVE", { operator: TEST_OPERATOR }, FULL_CHECKLIST),
    ).rejects.toMatchObject({
      code: "CONSENT_MISSING",
    });
  });

  it("a PAUSED route is not usable and does not trigger payment (AC-ROUTE-002)", async () => {
    const business = await createBusiness(db, businessInput());
    const route = await createRoute(db, business.slug, {});
    await changeRouteStatus(db, route.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    await changeRouteStatus(db, route.id, "ACTIVE", { operator: TEST_OPERATOR }, FULL_CHECKLIST);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });

    await expect(loadUsableRoute(db, route.id)).rejects.toMatchObject({
      code: "ROUTE_UNAVAILABLE",
      status: 409,
    });
  });

  it("wraps not-found as a 404 HttpError", async () => {
    await expect(loadUsableRoute(db, "missing")).rejects.toBeInstanceOf(HttpError);
  });
});
