// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { orderPayments } from "@/lib/db/schema";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { findTaskById } from "@/features/tasks/repository";
import { createHandoffReadyOrder } from "@/test-support/factories";

import type { OrderPaymentConfig } from "./config";
import {
  cancelOrderPayment,
  recordSubmittedOrderPayment,
  resumeOrderPaymentVerification,
  type Scheduler,
} from "./controller";
import { createOrderPaymentIntent } from "./intent";
import type { NgnUsdRate } from "./rate";
import { insertOrderPayment, updateOrderPayment } from "./repository";
import type { OnChainReceipt, ReceiptClient } from "./verify";

/**
 * Submission & cancellation controller (M10.5 §17, §21, §22). The buyer's only
 * input is a tx hash; the controller never marks a payment complete — that is
 * `verify.ts` alone.
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
  reason: "test",
};
const RATE: NgnUsdRate = {
  rate: 1500,
  source: "rate.test",
  fetchedAt: new Date("2026-09-06T00:00:00Z"),
};
const noopSchedule: Scheduler = () => {};
const TX = `0x${"a1b2".repeat(16)}`;

async function intent(session = "buyer-session-m105-0001") {
  const seed = await createHandoffReadyOrder(db, {
    session,
    businessName: `Prints ${session}`,
  });
  const row = await createOrderPaymentIntent(db, seed.task.id, seed.session, {
    config: CONFIG,
    fetchRate: async () => RATE,
  });
  return { ...seed, intent: row };
}

describe("recordSubmittedOrderPayment", () => {
  it("moves a fresh intent to CONFIRMING, stores the hash, and audits it", async () => {
    const { task, session, intent: row } = await intent();
    const updated = await recordSubmittedOrderPayment(
      db,
      task.id,
      session,
      { txHash: TX },
      noopSchedule,
    );

    expect(updated.status).toBe("CONFIRMING");
    expect(updated.txHash).toBe(TX);
    expect(row.status).toBe("CREATED");

    const events = await listTaskAuditEvents(db, task.id);
    expect(events.some((e) => e.type === "order_payment.submitted")).toBe(true);
  });

  it("schedules verification exactly once", async () => {
    const { task, session } = await intent();
    const schedule = vi.fn();
    await recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, schedule);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("is idempotent on the same hash (wallet retry / double-tap)", async () => {
    const { task, session } = await intent();
    const a = await recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule);
    const b = await recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule);
    expect(b.id).toBe(a.id);
    expect(await db.select().from(orderPayments)).toHaveLength(1);
  });

  it("rejects a malformed transaction hash (422)", async () => {
    const { task, session } = await intent();
    await expect(
      recordSubmittedOrderPayment(db, task.id, session, { txHash: "not-a-hash" }, noopSchedule),
    ).rejects.toMatchObject({ status: 422, code: "BAD_TX_HASH" });
  });

  it("rejects a hash already linked to another payment (409 TX_ALREADY_USED, §20)", async () => {
    const a = await intent("buyer-a");
    const b = await intent("buyer-b");
    await recordSubmittedOrderPayment(db, a.task.id, a.session, { txHash: TX }, noopSchedule);

    await expect(
      recordSubmittedOrderPayment(db, b.task.id, b.session, { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ status: 409, code: "TX_ALREADY_USED" });
  });

  it("403 when the caller is not the task's session", async () => {
    const { task } = await intent();
    await expect(
      recordSubmittedOrderPayment(db, task.id, "intruder", { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("404 when no payment intent has been started", async () => {
    const seed = await createHandoffReadyOrder(db);
    await expect(
      recordSubmittedOrderPayment(db, seed.task.id, seed.session, { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ status: 404, code: "NO_PAYMENT_INTENT" });
  });

  it("409 PAYMENT_CLOSED for a terminal intent", async () => {
    const { task, session, intent: row } = await intent();
    await updateOrderPayment(db, row.id, { status: "CANCELLED" });
    await expect(
      recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ status: 409, code: "PAYMENT_CLOSED" });
  });

  it("409 PAYMENT_EXPIRED once the window has elapsed", async () => {
    const { task, session, intent: row } = await intent();
    await updateOrderPayment(db, row.id, { expiresAt: new Date(Date.now() - 1000) });
    await expect(
      recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ status: 409, code: "PAYMENT_EXPIRED" });
  });
});

describe("cancelOrderPayment — the buyer dismissed the wallet (§21)", () => {
  it("moves a not-yet-submitted intent to CANCELLED and leaves the ORDER untouched", async () => {
    const { task, session, intent: row } = await intent();
    const cancelled = await cancelOrderPayment(db, task.id, session);

    expect(cancelled.status).toBe("CANCELLED");
    expect(row.id).toBe(cancelled.id);

    const t = await findTaskById(db, task.id);
    expect(t!.status).toBe("HANDOFF_READY"); // order still fine — WhatsApp handoff works

    const events = await listTaskAuditEvents(db, task.id);
    expect(events.some((e) => e.type === "order_payment.cancelled")).toBe(true);
  });

  it("will not cancel a payment that already has an on-chain transaction", async () => {
    const { task, session, intent: row } = await intent();
    await updateOrderPayment(db, row.id, { status: "CONFIRMING", txHash: TX });

    const result = await cancelOrderPayment(db, task.id, session);
    expect(result.status).toBe("CONFIRMING");
    expect(result.txHash).toBe(TX);
  });
});

describe("resumeOrderPaymentVerification — page load (§22)", () => {
  it("re-runs verification for an in-flight payment and can confirm it", async () => {
    const { task, session, intent: row } = await intent();
    await recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule);

    const receipt: OnChainReceipt = {
      status: "success",
      to: CONFIG.assetAddress,
      chainId: 42220,
      logs: [
        {
          address: CONFIG.assetAddress,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            `0x${"1".repeat(40).padStart(64, "0")}`,
            `0x${row.recipientAddress.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`,
          ],
          data: `0x${30_000_000n.toString(16).padStart(64, "0")}`,
        },
      ],
    };
    const client: ReceiptClient = { getReceipt: async () => receipt };

    const resumed = await resumeOrderPaymentVerification(db, task.id, { client, config: CONFIG });
    expect(resumed!.status).toBe("CONFIRMED");
  });

  it("returns a terminal payment unchanged without touching the chain", async () => {
    const { task, session, intent: row } = await intent();
    await updateOrderPayment(db, row.id, { status: "CANCELLED" });
    const client: ReceiptClient = {
      getReceipt: async () => {
        throw new Error("should not be called");
      },
    };
    const resumed = await resumeOrderPaymentVerification(db, task.id, { client });
    expect(resumed!.status).toBe("CANCELLED");
    void session;
  });

  it("returns null-ish when nothing is in flight (no tx hash yet)", async () => {
    const { task } = await intent();
    const resumed = await resumeOrderPaymentVerification(db, task.id);
    expect(resumed!.status).toBe("CREATED");
  });
});

describe("a seeded EXPIRED intent cannot be revived by submit", () => {
  it("stays terminal", async () => {
    const seed = await createHandoffReadyOrder(db);
    const row = await insertOrderPayment(db, {
      taskId: seed.task.id,
      quoteId: seed.commitment.quoteId,
      commitmentId: seed.commitment.id,
      buyerSession: seed.session,
      businessId: seed.commitment.businessId,
      recipientAddress: seed.commitment.providerAddress,
      chainId: 42220,
      asset: "USDC",
      assetAddress: CONFIG.assetAddress,
      amountAtomic: "30000000",
      amountNgnMinor: "4500000",
      ngnUsdRate: "1500",
      rateSource: "seed",
      rateLockedAt: new Date(),
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      recordSubmittedOrderPayment(db, seed.task.id, seed.session, { txHash: TX }, noopSchedule),
    ).rejects.toMatchObject({ code: "PAYMENT_CLOSED" });
    const [after] = await db.select().from(orderPayments).where(eq(orderPayments.id, row.id));
    expect(after.status).toBe("EXPIRED");
  });
});
