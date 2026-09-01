// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on dynamic JSON API responses */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import type { Database } from "@/lib/db/client";
import { auditEvents, tasks } from "@/lib/db/schema";
import { createBusiness } from "@/features/businesses/service";
import { changeRouteStatus, createRoute } from "@/features/routes/service";
import { updateRoute } from "@/features/routes/repository";
import { businessInput, createActiveRoute, TEST_OPERATOR } from "@/test-support/factories";

import { GET as capabilities } from "./[businessSlug]/capabilities/route";
import { POST as quote } from "./[businessSlug]/[routeSlug]/quote/route";

let db: Database;
let close: () => Promise<void>;
let n = 0;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  delete process.env.X402_FACILITATOR_URL;
  delete process.env.X402_FACILITATOR_KEY;
});
afterEach(async () => {
  await close();
});

const params = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

function quoteReq(path: string, body: unknown, withKey = true) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withKey ? { "idempotency-key": `v1-key-${(n += 1).toString().padStart(6, "0")}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_INPUT = {
  size: "A5",
  quantity: 250,
  colour: "full-colour",
  deadline: "Friday 3pm",
  deliveryArea: "UNILAG main gate",
};

async function draftRoute() {
  const business = await createBusiness(db, businessInput());
  const route = await createRoute(db, business.slug, {});
  return { business, route };
}

describe("GET /v1/:businessSlug/capabilities", () => {
  it("404s an unknown business", async () => {
    const res = await read(
      await capabilities(new Request("http://x"), params({ businessSlug: "nope" })),
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("BUSINESS_NOT_FOUND");
  });

  it("returns the full capability document for a draft route (no contact, payment unavailable)", async () => {
    const { business } = await draftRoute();
    const res = await capabilities(
      new Request("http://x"),
      params({ businessSlug: business.slug }),
    );
    expect(res.headers.get("cache-control")).toBe("no-store");

    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(body.data.business).toMatchObject({
      slug: business.slug,
      name: business.name,
      category: "printing",
      location: { city: "Lagos", country: "Nigeria" },
    });
    expect(body.data.finalOrderPolicy.humanApprovalRequired).toBe(true);

    const route = body.data.routes[0];
    expect(route.slug).toBe("flyer-printing");
    expect(route.status).toBe("DRAFT");
    expect(route.name).toBeTruthy();
    expect(route.description).toBeTruthy();
    expect(route.lastUpdatedAt).toBeTruthy();
    expect(route.inputSchema.fields.map((f: any) => f.key)).toEqual([
      "size",
      "quantity",
      "colour",
      "deadline",
      "deliveryArea",
    ]);
    expect(route.responseSchema.fields.some((f: any) => f.key === "amountMin")).toBe(true);
    expect(route.payoutAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(route.responseSlaMinutes).toBeGreaterThan(0);
    expect(route.payment.paid).toBe(true);
    expect(route.payment.state).toBe("PAYMENT_SERVICE_UNAVAILABLE");
    expect(route.payment.available).toBe(false);
    expect(route.orderContact).toBeUndefined();
  });

  it("an ACTIVE, fresh, verified route is AVAILABLE and exposes the order contact", async () => {
    const { business } = await createActiveRoute(db);
    const { body } = await read(
      await capabilities(new Request("http://x"), params({ businessSlug: business.slug })),
    );
    const route = body.data.routes[0];
    expect(route.status).toBe("ACTIVE");
    expect(route.stale).toBe(false);
    expect(route.availability).toMatchObject({
      state: "AVAILABLE",
      acceptingQuoteRequests: true,
      reason: "OK",
    });
    expect(route.freshness).toMatchObject({ maxAgeDays: 14, stale: false });
    expect(new Date(route.freshness.staleAfter).getTime()).toBeGreaterThan(Date.now());
    expect(route.quoteSla.responseWithinMinutes).toBeGreaterThan(0);
    expect(route.handoff).toMatchObject({ humanApprovalRequired: true, channelType: "whatsapp" });
    expect(body.data.finalOrderPolicy.whatsappHandoffRequired).toBe(true);
    expect(route.orderContact).toMatchObject({ channel: "whatsapp", value: "+2348012345678" });
  });

  it("a PENDING_VERIFICATION route is UNAVAILABLE and hides the order contact", async () => {
    const { business, route } = await draftRoute();
    await changeRouteStatus(db, route.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    const { body } = await read(
      await capabilities(new Request("http://x"), params({ businessSlug: business.slug })),
    );
    const card = body.data.routes[0];
    expect(card.status).toBe("PENDING_VERIFICATION");
    expect(card.availability).toMatchObject({
      state: "UNAVAILABLE",
      acceptingQuoteRequests: false,
      reason: "NOT_ACTIVE",
    });
    expect(card.availability.detail).toContain("does not accept public quote requests");
    expect(card.orderContact).toBeUndefined();
  });

  it("a PAUSED route is UNAVAILABLE and hides the order contact", async () => {
    const { business, route } = await createActiveRoute(db);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });
    const { body } = await read(
      await capabilities(new Request("http://x"), params({ businessSlug: business.slug })),
    );
    const card = body.data.routes[0];
    expect(card.status).toBe("PAUSED");
    expect(card.availability).toMatchObject({ state: "UNAVAILABLE", reason: "NOT_ACTIVE" });
    expect(card.orderContact).toBeUndefined();
  });

  it("an ACTIVE route with stale price data is explicitly UNAVAILABLE, never silently current", async () => {
    const { business, route } = await createActiveRoute(db);
    await updateRoute(db, route.id, {
      priceUpdatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    const { body } = await read(
      await capabilities(new Request("http://x"), params({ businessSlug: business.slug })),
    );
    const card = body.data.routes[0];
    // Lifecycle status is still ACTIVE...
    expect(card.status).toBe("ACTIVE");
    // ...but the usability verdict is UNAVAILABLE (AC-ROUTE-002).
    expect(card.availability).toMatchObject({
      state: "UNAVAILABLE",
      acceptingQuoteRequests: false,
      reason: "STALE",
    });
    expect(card.stale).toBe(true);
    expect(card.freshness.stale).toBe(true);
    expect(new Date(card.freshness.staleAfter).getTime()).toBeLessThan(Date.now());
    expect(card.orderContact).toBeUndefined();
  });
});

describe("POST /v1/:businessSlug/:routeSlug/quote", () => {
  it("requires an Idempotency-Key", async () => {
    const { business } = await createActiveRoute(db);
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }, false),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("404s an unknown business or route", async () => {
    const a = await read(
      await quote(
        quoteReq("/v1/ghost/flyer-printing/quote", { input: VALID_INPUT }),
        params({ businessSlug: "ghost", routeSlug: "flyer-printing" }),
      ),
    );
    expect(a.status).toBe(404);
    expect(a.body.error.code).toBe("BUSINESS_NOT_FOUND");

    const { business } = await createActiveRoute(db);
    const b = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/catering-quote/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "catering-quote" }),
      ),
    );
    expect(b.status).toBe(404);
    expect(b.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("returns a structured ROUTE_UNAVAILABLE for a draft route and creates no task or payment", async () => {
    const { business } = await draftRoute();
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROUTE_UNAVAILABLE");
    expect(res.body.error.details.route.reason).toBe("NOT_ACTIVE");
    expect(res.body.error.details.payment.requested).toBe(false);

    expect(await db.select().from(tasks)).toHaveLength(0);
    const events = await db.select().from(auditEvents);
    expect(events.map((e) => e.type)).not.toContain("capability.quote_requested");
  });

  it("rejects a malformed JSON body with 400 before touching the route", async () => {
    const { business } = await createActiveRoute(db);
    const res = await read(
      await quote(
        new Request(`http://localhost/v1/${business.slug}/flyer-printing/quote`, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": "v1-malformed-001" },
          body: "{ not json",
        }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("returns ROUTE_UNAVAILABLE for a route still pending verification", async () => {
    const { business, route } = await draftRoute();
    await changeRouteStatus(db, route.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROUTE_UNAVAILABLE");
    expect(res.body.error.details.route.reason).toBe("NOT_ACTIVE");
    expect(res.body.error.details.payment.requested).toBe(false);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("returns ROUTE_UNAVAILABLE for a paused route", async () => {
    const { business, route } = await createActiveRoute(db);
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details.route.status).toBe("PAUSED");
  });

  it("returns ROUTE_UNAVAILABLE (STALE) for an active route with old price data", async () => {
    const { business, route } = await createActiveRoute(db);
    await updateRoute(db, route.id, {
      priceUpdatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details.route.reason).toBe("STALE");
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("returns field-level errors for missing inputs and creates no task", async () => {
    const { business } = await createActiveRoute(db);
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: { size: "A5" } }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(["quantity", "colour", "deadline", "deliveryArea"]),
    );
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("creates a Task + audit and returns PAYMENT_SERVICE_UNAVAILABLE — never a fabricated settlement", async () => {
    const { business } = await createActiveRoute(db);
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, {
          requester: "erc8004:0xagent",
          input: VALID_INPUT,
        }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PAYMENT_SERVICE_UNAVAILABLE");
    const details = res.body.error.details;
    expect(details.taskId).toBeTruthy();
    expect(details.taskStatus).toBe("AWAITING_QUOTE");
    expect(details.payment).toMatchObject({
      status: "UNAVAILABLE",
      facilitator: null,
      settlement: null,
      txHash: null,
    });
    // No fabricated settlement: no tx hash, no X-PAYMENT verification echo.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/0x[0-9a-f]{64}/i);
    expect(raw.toLowerCase()).not.toContain("x-payment");
    expect(details.payment).not.toHaveProperty("verification");

    const [task] = await db.select().from(tasks);
    expect(task.status).toBe("AWAITING_QUOTE");
    expect(task.sessionId).toBe("agent:erc8004:0xagent");
    const types = (await db.select().from(auditEvents)).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["capability.quote_requested", "payment.unavailable"]),
    );
  });

  it("is idempotent — a repeat with the same key replays and creates one task", async () => {
    const { business } = await createActiveRoute(db);
    const req = () =>
      new Request(`http://localhost/v1/${business.slug}/flyer-printing/quote`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "v1-fixed-key-abc" },
        body: JSON.stringify({ input: VALID_INPUT }),
      });

    const first = await read(
      await quote(req(), params({ businessSlug: business.slug, routeSlug: "flyer-printing" })),
    );
    const second = await read(
      await quote(req(), params({ businessSlug: business.slug, routeSlug: "flyer-printing" })),
    );

    expect(second.status).toBe(first.status);
    expect(second.body.error.details.taskId).toBe(first.body.error.details.taskId);
    expect(await db.select().from(tasks)).toHaveLength(1);
  });

  it("accepts a valid request on a free route (202 AWAITING_QUOTE)", async () => {
    const { business, route } = await createActiveRoute(db);
    await updateRoute(db, route.id, { queryFeeUsd: "0.0000" });
    const res = await read(
      await quote(
        quoteReq(`/v1/${business.slug}/flyer-printing/quote`, { input: VALID_INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ outcome: "AWAITING_QUOTE", status: "AWAITING_QUOTE" });
    expect(res.body.data.taskId).toBeTruthy();
  });
});
