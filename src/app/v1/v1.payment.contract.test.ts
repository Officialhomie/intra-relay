// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on dynamic JSON API responses */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { auditEvents, servicePayments, tasks } from "@/lib/db/schema";
import { __setPaymentAdapter } from "@/features/payments/adapter";
import { NoopPaymentAdapter } from "@/features/payments/adapter/noop";
import { X402PaymentAdapter } from "@/features/payments/adapter/x402";
import {
  FakeFacilitator,
  VERIFY_INVALID,
  X402_TEST_CONFIG,
  buildXPaymentHeader,
} from "@/features/payments/adapter/__fixtures__/fake-facilitator";
import { createActiveRoute } from "@/test-support/factories";

import { POST as quote } from "./[businessSlug]/[routeSlug]/quote/route";

let db: Database;
let close: () => Promise<void>;
let n = 0;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
  __setPaymentAdapter(null);
});

const params = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });
const read = async (res: Response) => ({
  status: res.status,
  header: (name: string) => res.headers.get(name),
  body: (await res.json()) as any,
});

function req(path: string, body: unknown, headers: Record<string, string> = {}, key?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key ?? `v1-pay-${(n += 1).toString().padStart(6, "0")}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const INPUT = {
  size: "A5",
  quantity: 250,
  colour: "full-colour",
  deadline: "Friday 3pm",
  deliveryArea: "UNILAG main gate",
};

describe("POST /v1/:business/:route/quote — payments", () => {
  it("unconfigured adapter → 503 PAYMENT_SERVICE_UNAVAILABLE (task + audit kept)", async () => {
    __setPaymentAdapter(new NoopPaymentAdapter("no facilitator"));
    const { business } = await createActiveRoute(db);
    const res = await read(
      await quote(
        req(`/v1/${business.slug}/flyer-printing/quote`, { input: INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PAYMENT_SERVICE_UNAVAILABLE");

    const [payment] = await db.select().from(servicePayments);
    expect(payment.status).toBe("UNAVAILABLE");
    const types = (await db.select().from(auditEvents)).map((e) => e.type);
    expect(types).toContain("payment.unavailable");
  });

  it("configured adapter, no X-PAYMENT → 402 with official Celo x402 requirements, no task", async () => {
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator()));
    const { business, route } = await createActiveRoute(db);

    const res = await read(
      await quote(
        req(`/v1/${business.slug}/flyer-printing/quote`, { input: INPUT }),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("PAYMENT_REQUIRED");
    expect(res.body.error.details.maxFeeUsd).toBe(0.05);
    expect(res.body.error.details.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "eip155:42220",
      asset: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
      amount: "20000",
      payTo: route.payoutAddress,
    });

    expect(await db.select().from(tasks)).toHaveLength(0);
    const types = (await db.select().from(auditEvents)).map((e) => e.type);
    expect(types).toContain("payment.challenge_issued");
  });

  it("configured adapter, valid X-PAYMENT → 200 + X-PAYMENT-RESPONSE + immutable SETTLED receipt", async () => {
    const facilitator = new FakeFacilitator();
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, facilitator));
    const { business, route } = await createActiveRoute(db);

    const res = await read(
      await quote(
        req(
          `/v1/${business.slug}/flyer-printing/quote`,
          { requester: "erc8004:0xagent", input: INPUT },
          { "x-payment": buildXPaymentHeader({ payTo: route.payoutAddress }) },
        ),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );

    expect(res.status).toBe(200);
    expect(res.header("x-payment-response")).toBeTruthy();
    expect(res.body.data.payment).toMatchObject({
      status: "SETTLED",
      provider: "x402",
      network: "eip155:42220",
      assetSymbol: "USDC",
      amountAtomic: "20000",
    });
    expect(res.body.data.payment.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.body.data.payment.explorerUrl).toContain("celoscan.io/tx/");

    const [payment] = await db.select().from(servicePayments);
    expect(payment.status).toBe("SETTLED");
    expect(payment.txHash).toBe(res.body.data.payment.txHash);
    expect(payment.authorizationKey).toBeTruthy();
    expect(payment.network).toBe("eip155:42220");
    expect(JSON.stringify(payment.verification)).not.toMatch(/signature|authorization/i);

    const [task] = await db.select().from(tasks);
    expect(task.status).toBe("AWAITING_QUOTE");
    const types = (await db.select().from(auditEvents)).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["capability.quote_requested", "payment.settled"]),
    );
  });

  it("configured adapter, failed verification → 402 PAYMENT_FAILED, FAILED receipt, no task, settle not called", async () => {
    const facilitator = new FakeFacilitator({ verify: VERIFY_INVALID });
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, facilitator));
    const { business, route } = await createActiveRoute(db);

    const res = await read(
      await quote(
        req(
          `/v1/${business.slug}/flyer-printing/quote`,
          { input: INPUT },
          { "x-payment": buildXPaymentHeader({ payTo: route.payoutAddress }) },
        ),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("PAYMENT_FAILED");
    expect(res.body.error.details.code).toBe("VERIFICATION_FAILED");
    expect(facilitator.settleCalls).toBe(0);

    const [payment] = await db.select().from(servicePayments);
    expect(payment.status).toBe("FAILED");
    expect(payment.txHash).toBeNull();
    expect(await db.select().from(tasks)).toHaveLength(0);
    const types = (await db.select().from(auditEvents)).map((e) => e.type);
    expect(types).toContain("payment.failed");
  });

  it("duplicate X-PAYMENT (different Idempotency-Key) replays the same receipt without re-settling", async () => {
    const facilitator = new FakeFacilitator();
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, facilitator));
    const { business, route } = await createActiveRoute(db);
    const header = buildXPaymentHeader({
      payTo: route.payoutAddress,
      nonce: `0x${"9".repeat(64)}`,
    });

    const first = await read(
      await quote(
        req(
          `/v1/${business.slug}/flyer-printing/quote`,
          { input: INPUT },
          { "x-payment": header },
          "idem-key-one-01",
        ),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    const second = await read(
      await quote(
        req(
          `/v1/${business.slug}/flyer-printing/quote`,
          { input: INPUT },
          { "x-payment": header },
          "idem-key-two-02",
        ),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.taskId).toBe(first.body.data.taskId);
    expect(second.body.data.payment.txHash).toBe(first.body.data.payment.txHash);
    expect(facilitator.verifyCalls).toBe(1);
    expect(facilitator.settleCalls).toBe(1);
    expect(await db.select().from(servicePayments)).toHaveLength(1);
  });

  it("route not ready + X-PAYMENT present → 409 ROUTE_UNAVAILABLE, facilitator never called", async () => {
    const facilitator = new FakeFacilitator();
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, facilitator));
    const { business } = await createActiveRoute(db);
    // A different, un-verified route.
    const { business: business2, route: route2 } = await createActiveRoute(db, {
      businessName: "Other Prints",
    });
    void business;
    // Force route2 stale so it is not quote-ready.
    const { updateRoute } = await import("@/features/routes/repository");
    await updateRoute(db, route2.id, {
      priceUpdatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });

    const res = await read(
      await quote(
        req(
          `/v1/${business2.slug}/flyer-printing/quote`,
          { input: INPUT },
          { "x-payment": buildXPaymentHeader({ payTo: route2.payoutAddress }) },
        ),
        params({ businessSlug: business2.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROUTE_UNAVAILABLE");
    expect(facilitator.verifyCalls).toBe(0);
    expect(facilitator.settleCalls).toBe(0);
    expect(await db.select().from(servicePayments)).toHaveLength(0);
  });

  it("rejects an X-PAYMENT whose authorised amount exceeds the $0.05 cap", async () => {
    __setPaymentAdapter(new X402PaymentAdapter(X402_TEST_CONFIG, new FakeFacilitator()));
    const { business, route } = await createActiveRoute(db);
    const res = await read(
      await quote(
        req(
          `/v1/${business.slug}/flyer-printing/quote`,
          { input: INPUT },
          {
            "x-payment": buildXPaymentHeader({
              payTo: route.payoutAddress,
              amountAtomic: "500000",
            }),
          },
        ),
        params({ businessSlug: business.slug, routeSlug: "flyer-printing" }),
      ),
    );
    expect(res.status).toBe(402);
    expect(res.body.error.details.code).toBe("REQUIREMENTS_MISMATCH");
  });
});
