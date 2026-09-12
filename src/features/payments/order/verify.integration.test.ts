// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { commitments, orderPayments } from "@/lib/db/schema";
import { listTaskAuditEvents } from "@/features/audit/repository";
import { getInbox } from "@/features/notifications/service";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import { createHandoffReadyOrder } from "@/test-support/factories";

import type { OrderPaymentConfig } from "./config";
import { createOrderPaymentIntent } from "./intent";
import type { NgnUsdRate } from "./rate";
import { updateOrderPayment } from "./repository";
import {
  TRANSFER_TOPIC,
  verifyOrderPayment,
  type OnChainLog,
  type OnChainReceipt,
  type ReceiptClient,
} from "./verify";

/**
 * Server-side settlement verification (M10.5 §17–§19, §44). CONFIRMED is only
 * ever reached by reading a real receipt whose every field matches the
 * server-authoritative intent. The client's "success" is never trusted.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const USDC = "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C";
const CONFIG: OrderPaymentConfig = {
  enabled: true,
  chainId: 42220,
  asset: "USDC",
  assetAddress: USDC,
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

const PAYER = `0x${"1".repeat(40)}`;

function pad32(addr: string): string {
  return `0x${addr.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
}
function transferLog(to: string, valueAtomic: bigint, token = USDC, from = PAYER): OnChainLog {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, pad32(from), pad32(to)],
    data: `0x${valueAtomic.toString(16).padStart(64, "0")}`,
  };
}
function receipt(over: Partial<OnChainReceipt> & { logs: OnChainLog[] }): OnChainReceipt {
  return { status: "success", to: USDC, chainId: 42220, ...over };
}
const client = (r: OnChainReceipt | null): ReceiptClient => ({ getReceipt: async () => r });

/** An intent that has been moved to CONFIRMING with a tx hash, ready to verify. */
async function submittedIntent(
  txHash: string,
  opts: Parameters<typeof createHandoffReadyOrder>[1] = {},
) {
  const seed = await createHandoffReadyOrder(db, opts);
  const intent = await createOrderPaymentIntent(db, seed.task.id, seed.session, {
    config: CONFIG,
    fetchRate: async () => RATE,
  });
  const submitted = await updateOrderPayment(db, intent.id, { status: "SUBMITTED", txHash });
  return { ...seed, intent: submitted };
}

const opts = { config: CONFIG, now: () => Date.parse("2026-09-06T01:00:00Z") };

describe("verifyOrderPayment — the happy path", () => {
  it("CONFIRMS when the receipt matches chain, contract, recipient and amount", async () => {
    const TX = `0x${"c".repeat(64)}`;
    const { intent, task, business } = await submittedIntent(TX);
    const r = receipt({ logs: [transferLog(intent.recipientAddress, 30_000_000n)] });

    const { row, outcome } = await verifyOrderPayment(db, intent.id, {
      ...opts,
      client: client(r),
    });

    expect(outcome).toBe("confirmed");
    expect(row.status).toBe("CONFIRMED");
    expect(row.settledAt).not.toBeNull();
    expect(row.payerAddress?.toLowerCase()).toBe(PAYER.toLowerCase());
    expect(row.error).toBeNull();

    // Audit + notifications for both parties.
    const events = await listTaskAuditEvents(db, task.id);
    expect(events.some((e) => e.type === "order_payment.confirmed")).toBe(true);
    const buyerInbox = await getInbox(db, "BUYER", task.sessionId!);
    expect(buyerInbox.items.some((i) => /payment confirmed/i.test(i.title))).toBe(true);
    const bizInbox = await getInbox(db, "BUSINESS", business.id);
    expect(bizInbox.items.some((i) => /payment received/i.test(i.title))).toBe(true);
  });

  it("binds the real paying wallet to the commitment's buyer address", async () => {
    const TX = `0x${"d".repeat(64)}`;
    const { intent, task } = await submittedIntent(TX);
    const before = await findCommitmentByTaskId(db, task.id);
    expect(before!.buyerAddress).toBe(OFF_CHAIN_ASSET);

    await verifyOrderPayment(db, intent.id, {
      ...opts,
      client: client(receipt({ logs: [transferLog(intent.recipientAddress, 30_000_000n)] })),
    });

    const after = await findCommitmentByTaskId(db, task.id);
    expect(after!.buyerAddress.toLowerCase()).toBe(PAYER.toLowerCase());
  });

  it("is a no-op on a second run — no duplicate notifications", async () => {
    const TX = `0x${"e".repeat(64)}`;
    const { intent, task } = await submittedIntent(TX);
    const r = client(receipt({ logs: [transferLog(intent.recipientAddress, 30_000_000n)] }));

    await verifyOrderPayment(db, intent.id, { ...opts, client: r });
    const second = await verifyOrderPayment(db, intent.id, { ...opts, client: r });

    expect(second.outcome).toBe("noop");
    const buyerInbox = await getInbox(db, "BUYER", task.sessionId!);
    // dedupeKey is per-order, so the row is upserted — still exactly one.
    expect(buyerInbox.items.filter((i) => i.event === "order_payment.confirmed")).toHaveLength(1);
  });
});

describe("verifyOrderPayment — every mismatch FAILS with a clear reason", () => {
  const cases: { name: string; receipt: (recipient: string) => OnChainReceipt; match: RegExp }[] = [
    {
      name: "the transaction reverted",
      receipt: (to) => receipt({ status: "reverted", logs: [transferLog(to, 30_000_000n)] }),
      match: /reverted/i,
    },
    {
      name: "the transaction is on the wrong chain",
      receipt: (to) => receipt({ chainId: 1, logs: [transferLog(to, 30_000_000n)] }),
      match: /chain 1/i,
    },
    {
      name: "the call was not to the stablecoin contract",
      receipt: (to) => receipt({ to: `0x${"9".repeat(40)}`, logs: [transferLog(to, 30_000_000n)] }),
      match: /stablecoin contract/i,
    },
    {
      name: "there is no transfer to the business",
      receipt: () => receipt({ logs: [transferLog(`0x${"7".repeat(40)}`, 30_000_000n)] }),
      match: /no stablecoin transfer/i,
    },
    {
      name: "the transfer is of a different token",
      receipt: (to) => receipt({ logs: [transferLog(to, 30_000_000n, `0x${"8".repeat(40)}`)] }),
      match: /no stablecoin transfer/i,
    },
    {
      name: "more than one transfer to the business",
      receipt: (to) =>
        receipt({ logs: [transferLog(to, 15_000_000n), transferLog(to, 15_000_000n)] }),
      match: /more than one transfer/i,
    },
    {
      name: "the amount is wrong",
      receipt: (to) => receipt({ logs: [transferLog(to, 29_000_000n)] }),
      match: /agreed amount was 30000000/i,
    },
  ];

  cases.forEach((c, i) => {
    it(`FAILED — ${c.name}`, async () => {
      const TX = `0x${String(i + 1)
        .repeat(64)
        .slice(0, 64)}`;
      const { intent, task } = await submittedIntent(TX);

      const { row, outcome } = await verifyOrderPayment(db, intent.id, {
        ...opts,
        client: client(c.receipt(intent.recipientAddress)),
      });

      expect(outcome).toBe("failed");
      expect(row.status).toBe("FAILED");
      expect(row.error).toMatch(c.match);

      const events = await listTaskAuditEvents(db, task.id);
      expect(events.some((e) => e.type === "order_payment.failed")).toBe(true);
      const inbox = await getInbox(db, "BUYER", task.sessionId!);
      expect(inbox.items.some((i) => /didn't go through/i.test(i.title))).toBe(true);
    });
  });
});

describe("verifyOrderPayment — pending, not failed, when the chain has not answered", () => {
  it("stays CONFIRMING and asks the buyer to wait when the receipt is not found", async () => {
    const TX = `0x${"b".repeat(64)}`;
    const { intent, task } = await submittedIntent(TX);

    const { row, outcome } = await verifyOrderPayment(db, intent.id, {
      ...opts,
      client: client(null),
    });

    expect(outcome).toBe("pending");
    expect(row.status).toBe("CONFIRMING");
    expect(row.verifyAttempts).toBe(1);
    const inbox = await getInbox(db, "BUYER", task.sessionId!);
    expect(inbox.items.some((i) => /still confirming/i.test(i.title))).toBe(true);
  });

  it("notes it will keep checking once attempts are exhausted", async () => {
    const TX = `0x${"f".repeat(64)}`;
    const { intent } = await submittedIntent(TX);
    await updateOrderPayment(db, intent.id, { verifyAttempts: 7 });

    const { row } = await verifyOrderPayment(db, intent.id, { ...opts, client: client(null) });
    expect(row.verifyAttempts).toBe(8);
    expect(row.error).toMatch(/keep checking/i);
  });
});

describe("verifyOrderPayment — replay protection (§20, §44)", () => {
  it("the tx_hash unique index binds a hash to exactly one intent", async () => {
    const TX = `0x${"a".repeat(64)}`;
    await submittedIntent(TX, {
      session: "buyer-1",
      payoutAddress: `0x${"a".repeat(40)}`,
      businessName: "Prints One",
    });

    // A second intent cannot record the same on-chain transaction.
    await expect(
      submittedIntent(TX, {
        session: "buyer-2",
        payoutAddress: `0x${"b".repeat(40)}`,
        businessName: "Prints Two",
      }),
    ).rejects.toThrow();
  });

  it("a receipt paying order A cannot confirm order B (different recipient)", async () => {
    const { intent: intentA } = await submittedIntent(`0x${"1".repeat(64)}`, {
      session: "buyer-a",
      payoutAddress: `0x${"a".repeat(40)}`,
      businessName: "Prints A",
    });
    const { intent: intentB } = await submittedIntent(`0x${"2".repeat(64)}`, {
      session: "buyer-b",
      payoutAddress: `0x${"b".repeat(40)}`,
      businessName: "Prints B",
    });

    // Feed order B a receipt that pays order A's recipient.
    const { row, outcome } = await verifyOrderPayment(db, intentB.id, {
      ...opts,
      client: client(receipt({ logs: [transferLog(intentA.recipientAddress, 30_000_000n)] })),
    });

    expect(outcome).toBe("failed");
    expect(row.status).toBe("FAILED");
    expect(row.error).toMatch(/no stablecoin transfer to the business/i);
  });
});

describe("verifyOrderPayment — nothing to do", () => {
  it("no-ops for a CREATED intent with no tx hash", async () => {
    const { task, session } = await createHandoffReadyOrder(db);
    const intent = await createOrderPaymentIntent(db, task.id, session, {
      config: CONFIG,
      fetchRate: async () => RATE,
    });
    const { outcome } = await verifyOrderPayment(db, intent.id, { ...opts, client: client(null) });
    expect(outcome).toBe("noop");
    const [row] = await db.select().from(orderPayments).where(eq(orderPayments.id, intent.id));
    expect(row.status).toBe("CREATED");
  });
});

describe("verifyOrderPayment — commitment already had a buyer address", () => {
  it("does not overwrite a bound buyer address", async () => {
    const TX = `0x${"9".repeat(64)}`;
    const { intent, task } = await submittedIntent(TX);
    const commitment = await findCommitmentByTaskId(db, task.id);
    await db
      .update(commitments)
      .set({ buyerAddress: `0x${"5".repeat(40)}` })
      .where(eq(commitments.id, commitment!.id));

    await verifyOrderPayment(db, intent.id, {
      ...opts,
      client: client(receipt({ logs: [transferLog(intent.recipientAddress, 30_000_000n)] })),
    });

    const after = await findCommitmentByTaskId(db, task.id);
    expect(after!.buyerAddress).toBe(`0x${"5".repeat(40)}`);
  });
});
