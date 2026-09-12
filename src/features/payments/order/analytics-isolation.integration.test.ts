// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * Product analytics is a MEASUREMENT layer, never a dependency of settlement
 * (M10.5 §37, M9.5 §4, §41). Even if the analytics arm throws synchronously,
 * the payment still records and confirms.
 */

const { forwardMock } = vi.hoisted(() => ({ forwardMock: vi.fn() }));
vi.mock("@/features/analytics/server", () => ({ forwardServerAnalyticsEvent: forwardMock }));

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { createHandoffReadyOrder } from "@/test-support/factories";

import type { OrderPaymentConfig } from "./config";
import { recordSubmittedOrderPayment, type Scheduler } from "./controller";
import { createOrderPaymentIntent } from "./intent";
import type { NgnUsdRate } from "./rate";
import {
  TRANSFER_TOPIC,
  verifyOrderPayment,
  type OnChainReceipt,
  type ReceiptClient,
} from "./verify";

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
  reason: "test",
};
const RATE: NgnUsdRate = {
  rate: 1500,
  source: "rate.test",
  fetchedAt: new Date("2026-09-06T00:00:00Z"),
};
const noopSchedule: Scheduler = () => {};

it("a throwing analytics arm does not stop a payment recording or confirming", async () => {
  // Set up with a quiet mock, then make analytics blow up for the payment path.
  const { task, session } = await createHandoffReadyOrder(db, {
    payoutAddress: `0x${"cd".repeat(20)}`,
  });
  const intent = await createOrderPaymentIntent(db, task.id, session, {
    config: CONFIG,
    fetchRate: async () => RATE,
  });

  forwardMock.mockImplementation(() => {
    throw new Error("analytics blew up");
  });

  const TX = `0x${"ab".repeat(32)}`;
  const submitted = await recordSubmittedOrderPayment(
    db,
    task.id,
    session,
    { txHash: TX },
    noopSchedule,
  );
  expect(submitted.status).toBe("CONFIRMING");

  const receipt: OnChainReceipt = {
    status: "success",
    to: CONFIG.assetAddress,
    chainId: 42220,
    logs: [
      {
        address: CONFIG.assetAddress,
        topics: [
          TRANSFER_TOPIC,
          `0x${"1".repeat(40).padStart(64, "0")}`,
          `0x${intent.recipientAddress.replace(/^0x/, "").padStart(64, "0")}`,
        ],
        data: `0x${30_000_000n.toString(16).padStart(64, "0")}`,
      },
    ],
  };
  const client: ReceiptClient = { getReceipt: async () => receipt };

  const { row, outcome } = await verifyOrderPayment(db, intent.id, { config: CONFIG, client });
  expect(outcome).toBe("confirmed");
  expect(row.status).toBe("CONFIRMED");
});
