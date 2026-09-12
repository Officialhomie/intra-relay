// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { orderPayments } from "@/lib/db/schema";
import { buildTransactionTrace } from "@/features/evidence/trace";
import { getTaskView } from "@/features/tasks/service";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { createHandoffReadyOrder } from "@/test-support/factories";

import type { OrderPaymentConfig } from "./config";
import { createOrderPaymentIntent } from "./intent";
import { RateUnavailableError, type NgnUsdRate } from "./rate";
import { recordSubmittedOrderPayment, type Scheduler } from "./controller";
import { getOrderPaymentForTask } from "./service";
import {
  TRANSFER_TOPIC,
  verifyOrderPayment,
  type OnChainReceipt,
  type ReceiptClient,
} from "./verify";

/**
 * End-to-end (deterministic, no funds): create → submit(fake tx) → verify →
 * CONFIRMED, and the evidence trace then reconciles the DB with the on-chain
 * record. Also: the buyer/business order still completes when the FX source is
 * down — the MiniPay path just goes unavailable (M10.5 §16, §50).
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const PAYOUT = `0x${"ab".repeat(20)}`;
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
const noopSchedule: Scheduler = () => {};
const PAYER = `0x${"11".repeat(20)}`;

function matchingReceipt(recipient: string): OnChainReceipt {
  return {
    status: "success",
    to: CONFIG.assetAddress,
    chainId: 42220,
    logs: [
      {
        address: CONFIG.assetAddress,
        topics: [
          TRANSFER_TOPIC,
          `0x${PAYER.replace(/^0x/, "").padStart(64, "0")}`,
          `0x${recipient.replace(/^0x/, "").padStart(64, "0")}`,
        ],
        data: `0x${30_000_000n.toString(16).padStart(64, "0")}`,
      },
    ],
  };
}

describe("full order-payment lifecycle", () => {
  it("create → submit → verify → CONFIRMED, and the evidence trace reconciles", async () => {
    const { task, session } = await createHandoffReadyOrder(db, { payoutAddress: PAYOUT });

    const created = await createOrderPaymentIntent(db, task.id, session, {
      config: CONFIG,
      fetchRate: async () => RATE,
    });
    expect(created.status).toBe("CREATED");

    const TX = `0x${"fe".repeat(32)}`;
    await recordSubmittedOrderPayment(db, task.id, session, { txHash: TX }, noopSchedule);

    const client: ReceiptClient = {
      getReceipt: async () => matchingReceipt(created.recipientAddress),
    };
    const { row, outcome } = await verifyOrderPayment(db, created.id, { config: CONFIG, client });
    expect(outcome).toBe("confirmed");
    expect(row.status).toBe("CONFIRMED");
    expect(row.txHash).toBe(TX);

    // Evidence trace: the operator/judge surface now carries the settlement.
    const trace = await buildTransactionTrace(db, task.id);
    expect(trace!.orderPayment).toMatchObject({
      status: "CONFIRMED",
      asset: "USDC",
      amountAtomic: "30000000",
      amountNgnMinor: "4500000",
      ngnUsdRate: "1500",
      txHash: TX,
      verified: true,
    });
    expect(trace!.orderPayment!.txExplorer).toContain("celoscan.io/tx/");
    expect(trace!.orderPayment!.payer!.toLowerCase()).toBe(PAYER.toLowerCase());
    expect(trace!.consistency.orderPaymentConfirmed).toBe(true);
    expect(trace!.consistency.paymentRecipientMatchesPayout).toBe(true);

    // The paying wallet is now bound to the commitment (for the later handover).
    const commitment = await findCommitmentByTaskId(db, task.id);
    expect(commitment!.buyerAddress.toLowerCase()).toBe(PAYER.toLowerCase());
  });

  it("a mismatched payout address shows up as an inconsistency, not a silent pass", async () => {
    const { task, session } = await createHandoffReadyOrder(db, { payoutAddress: PAYOUT });
    const created = await createOrderPaymentIntent(db, task.id, session, {
      config: CONFIG,
      fetchRate: async () => RATE,
    });
    await recordSubmittedOrderPayment(
      db,
      task.id,
      session,
      { txHash: `0x${"cd".repeat(32)}` },
      noopSchedule,
    );

    // Receipt pays a DIFFERENT address than the intent's recipient.
    const wrong: ReceiptClient = {
      getReceipt: async () => matchingReceipt(`0x${"99".repeat(20)}`),
    };
    const { row } = await verifyOrderPayment(db, created.id, { config: CONFIG, client: wrong });
    expect(row.status).toBe("FAILED");

    const trace = await buildTransactionTrace(db, task.id);
    expect(trace!.consistency.orderPaymentConfirmed).toBe(false);
  });
});

describe("the order still completes when the FX source is down (§16, §50)", () => {
  it("intent creation fails cleanly and the WhatsApp handoff is untouched", async () => {
    const { task, session } = await createHandoffReadyOrder(db);

    await expect(
      createOrderPaymentIntent(db, task.id, session, {
        config: CONFIG,
        fetchRate: async () => {
          throw new RateUnavailableError("provider 503");
        },
      }),
    ).rejects.toMatchObject({ status: 503, code: "PAYMENT_METHOD_UNAVAILABLE" });

    // No payment row, order still HANDOFF_READY, the pre-filled message still exists.
    expect(await db.select().from(orderPayments)).toHaveLength(0);
    const view = await getTaskView(db, task.id, session);
    expect(view.task.status).toBe("HANDOFF_READY");
    expect(view.recommendation?.orderMessage).toBeTruthy();
  });

  it("getOrderPaymentForTask reports the path as not-offered when disabled, with a plain reason", async () => {
    const { task } = await createHandoffReadyOrder(db);
    const disabled: OrderPaymentConfig = {
      ...CONFIG,
      enabled: false,
      reason: "NETWORK_ENV is not production.",
    };
    const view = await getOrderPaymentForTask(db, task.id, disabled);
    expect(view).not.toBeNull();
    expect(view!.offered).toBe(false);
    expect(view!.reason).toMatch(/not production/i);
    expect(view!.paid).toBe(false);
  });

  it("getOrderPaymentForTask never offers MiniPay to a business with no real payout address (M10 pilot-readiness audit)", async () => {
    const { task } = await createHandoffReadyOrder(db, { payoutAddress: `0x${"0".repeat(40)}` });
    const view = await getOrderPaymentForTask(db, task.id, CONFIG);
    expect(view).not.toBeNull();
    expect(view!.offered).toBe(false);
    expect(view!.paid).toBe(false);
    expect(view!.reason).toMatch(/hasn't set up on-chain payment/i);
  });
});
