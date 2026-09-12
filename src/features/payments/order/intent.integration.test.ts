// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { commitments, orderPayments } from "@/lib/db/schema";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { createHandoffReadyOrder, createActiveRoute } from "@/test-support/factories";
import { createTask, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF } from "@/test-support/factories";

import type { OrderPaymentConfig } from "./config";
import { createOrderPaymentIntent, invalidateOrderPaymentsForTask } from "./intent";
import { RateUnavailableError, type NgnUsdRate } from "./rate";
import { insertOrderPayment } from "./repository";

/**
 * Intent creation is the ONLY way a payment is born (M10.5 §3, §8, §9). The
 * recipient, amount and asset come exclusively from the server-authoritative
 * accepted commitment — never the client, never an LLM.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const CONFIG: OrderPaymentConfig = {
  enabled: true,
  chainId: 42220,
  asset: "USDC",
  assetAddress: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  assetDecimals: 6,
  rpcUrl: "https://rpc.test",
  rateUrl: "https://rate.test/USD",
  attributionTag: null,
  reason: "test: enabled",
};

const RATE: NgnUsdRate = {
  rate: 1500,
  source: "rate.test (updated Sat, 06 Sep 2026 00:00:01 +0000)",
  fetchedAt: new Date("2026-09-06T00:00:00Z"),
};

const deps = { config: CONFIG, fetchRate: async () => RATE };

describe("createOrderPaymentIntent — resolves everything server-side", () => {
  it("binds recipient, amount and asset from the accepted commitment", async () => {
    const { task, business, commitment, session } = await createHandoffReadyOrder(db);

    const row = await createOrderPaymentIntent(db, task.id, session, deps);

    expect(row.status).toBe("CREATED");
    expect(row.recipientAddress).toBe(business.payoutAddress);
    expect(row.recipientAddress).toBe(commitment.providerAddress);
    expect(row.chainId).toBe(42220);
    expect(row.asset).toBe("USDC");
    expect(row.assetAddress).toBe(CONFIG.assetAddress);
    // ₦45,000 (4_500_000 kobo) / 1500 = $30 → 30_000_000 atomic
    expect(row.amountNgnMinor).toBe("4500000");
    expect(row.amountAtomic).toBe("30000000");
    expect(row.ngnUsdRate).toBe("1500");
    expect(row.rateSource).toContain("rate.test");
    expect(row.commitmentId).toBe(commitment.id);
    expect(row.buyerSession).toBe(session);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("writes an audit event with the locked rate and amount", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    await createOrderPaymentIntent(db, task.id, session, deps);

    const events = await listTaskAuditEvents(db, task.id);
    const created = events.find((e) => e.type === "order_payment.created");
    expect(created).toBeTruthy();
    expect(created!.data).toMatchObject({
      asset: "USDC",
      amountAtomic: "30000000",
      ngnUsdRate: "1500",
      chainId: 42220,
    });
  });

  it("includes the delivery charge in the amount", async () => {
    const { task, session } = await createHandoffReadyOrder(db, {
      amountMin: 45000,
      deliveryCharge: 5000,
    });
    const row = await createOrderPaymentIntent(db, task.id, session, deps);
    expect(row.amountNgnMinor).toBe("5000000");
  });

  it("hands back the same live intent on a repeat call — never a second row (§20)", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    const a = await createOrderPaymentIntent(db, task.id, session, deps);
    const b = await createOrderPaymentIntent(db, task.id, session, deps);

    expect(b.id).toBe(a.id);
    expect(await db.select().from(orderPayments)).toHaveLength(1);
  });

  it("returns an already-CONFIRMED payment instead of minting a new one", async () => {
    const { task, commitment, session } = await createHandoffReadyOrder(db);
    const seeded = await insertOrderPayment(db, {
      taskId: task.id,
      quoteId: commitment.quoteId,
      commitmentId: commitment.id,
      buyerSession: session,
      businessId: commitment.businessId,
      recipientAddress: commitment.providerAddress,
      chainId: 42220,
      asset: "USDC",
      assetAddress: CONFIG.assetAddress,
      amountAtomic: "30000000",
      amountNgnMinor: "4500000",
      ngnUsdRate: "1500",
      rateSource: "seed",
      rateLockedAt: new Date(),
      status: "CONFIRMED",
      txHash: `0x${"a".repeat(64)}`,
      expiresAt: new Date(Date.now() + 1_000),
    });

    const row = await createOrderPaymentIntent(db, task.id, session, deps);
    expect(row.id).toBe(seeded.id);
    expect(row.status).toBe("CONFIRMED");
  });
});

describe("createOrderPaymentIntent — guards", () => {
  it("503 PAYMENT_METHOD_UNAVAILABLE when the path is disabled", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    await expect(
      createOrderPaymentIntent(db, task.id, session, {
        ...deps,
        config: { ...CONFIG, enabled: false, reason: "not production" },
      }),
    ).rejects.toMatchObject({ status: 503, code: "PAYMENT_METHOD_UNAVAILABLE" });
  });

  it("403 when the task belongs to another session", async () => {
    const { task } = await createHandoffReadyOrder(db);
    await expect(
      createOrderPaymentIntent(db, task.id, "someone-else-session", deps),
    ).rejects.toMatchObject({ status: 403, code: "TASK_FORBIDDEN" });
  });

  it("409 OFFER_NOT_ACCEPTED before the buyer has accepted a quote", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "buyer-session-pending", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "buyer-session-pending");

    await expect(
      createOrderPaymentIntent(db, task.id, "buyer-session-pending", deps),
    ).rejects.toMatchObject({ status: 409, code: "OFFER_NOT_ACCEPTED" });
  });

  it("409 NO_COMMITMENT when the commitment row is missing", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    await db.delete(commitments).where(eq(commitments.taskId, task.id));

    await expect(createOrderPaymentIntent(db, task.id, session, deps)).rejects.toMatchObject({
      status: 409,
      code: "NO_COMMITMENT",
    });
  });

  it("409 COMMITMENT_EXPIRED once the agreed window has passed", async () => {
    const { task, session } = await createHandoffReadyOrder(db, { expiresAt: null });
    // Default commitment window is 24h; jump 100 days ahead.
    const later = Date.now() + 100 * 24 * 60 * 60 * 1000;

    await expect(
      createOrderPaymentIntent(db, task.id, session, { ...deps, now: () => later }),
    ).rejects.toMatchObject({ status: 409, code: "COMMITMENT_EXPIRED" });
  });

  it("503 PAYMENT_METHOD_UNAVAILABLE when the business has no real payout address (M10 pilot-readiness audit)", async () => {
    // A quick-start business is stored with the zero-address placeholder
    // (src/features/businesses/quick-start.ts), never a guess. Sending USDC
    // there would be an irrecoverable loss — refuse before the rate/wallet.
    const { task, session } = await createHandoffReadyOrder(db, {
      payoutAddress: `0x${"0".repeat(40)}`,
    });

    await expect(createOrderPaymentIntent(db, task.id, session, deps)).rejects.toMatchObject({
      status: 503,
      code: "PAYMENT_METHOD_UNAVAILABLE",
    });
    expect(await db.select().from(orderPayments)).toHaveLength(0);
  });

  it("503 (never a guessed rate) when the FX source is unreachable (§16)", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    await expect(
      createOrderPaymentIntent(db, task.id, session, {
        ...deps,
        fetchRate: async () => {
          throw new RateUnavailableError("source down");
        },
      }),
    ).rejects.toMatchObject({ status: 503, code: "PAYMENT_METHOD_UNAVAILABLE" });

    // Nothing was written — the order is untouched, WhatsApp handoff still works.
    expect(await db.select().from(orderPayments)).toHaveLength(0);
  });
});

describe("invalidateOrderPaymentsForTask — a terms change kills the intent (§11)", () => {
  it("expires a live intent and records why, without throwing", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    const row = await createOrderPaymentIntent(db, task.id, session, deps);

    await invalidateOrderPaymentsForTask(db, task.id);

    const [after] = await db.select().from(orderPayments).where(eq(orderPayments.id, row.id));
    expect(after.status).toBe("EXPIRED");

    const events = await listTaskAuditEvents(db, task.id);
    expect(events.some((e) => e.type === "order_payment.invalidated")).toBe(true);
  });

  it("is a no-op (no throw) when there is nothing live to invalidate", async () => {
    const { task } = await createHandoffReadyOrder(db);
    await expect(invalidateOrderPaymentsForTask(db, task.id)).resolves.toBeUndefined();
  });
});
