/**
 * Server-side settlement verification (M10.5 §17–§19, §46, ADR-023).
 *
 * MANDATORY and never trusts the client. A payment reaches CONFIRMED only after
 * this reads the real Celo transaction receipt and every field matches the
 * server-authoritative intent: chain, success, the USDC contract as the `to`,
 * exactly one USDC Transfer to the intent's recipient for the intent's exact
 * amount, and a tx hash that has not already settled another intent (§20, §44).
 */
import type { Database } from "@/lib/db/client";
import type { OrderPaymentRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";
import { updateCommitment } from "@/features/commitments/repository";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import { notify } from "@/features/notifications/service";
import { forwardServerAnalyticsEvent } from "@/features/analytics/server";

import { readOrderPaymentConfig, type OrderPaymentConfig } from "./config";
import { findOrderPaymentById, updateOrderPayment } from "./repository";
import { ORDER_PAYMENT_MAX_VERIFY_ATTEMPTS } from "./status";

/** ERC-20 `Transfer(address indexed from, address indexed to, uint256 value)`. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface OnChainLog {
  address: string;
  topics: string[];
  data: string;
}
export interface OnChainReceipt {
  status: "success" | "reverted";
  to: string | null;
  logs: OnChainLog[];
  /** Optional — some providers include it. When present it is checked. */
  chainId?: number;
}
export interface ReceiptClient {
  /** null ⇒ the tx is not yet mined / not found — retry, do not fail. */
  getReceipt(txHash: string): Promise<OnChainReceipt | null>;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}
function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Product analytics must never affect settlement (M10.5 §37, M9.5 §4).
 * `forwardServerAnalyticsEvent` already swallows its own errors; this is a
 * second guard so a regression there can never fail a payment.
 */
function safeForward(input: Parameters<typeof forwardServerAnalyticsEvent>[0]): void {
  try {
    forwardServerAnalyticsEvent(input);
  } catch {
    /* isolated */
  }
}

async function realClient(config: OrderPaymentConfig): Promise<ReceiptClient> {
  const [{ createPublicClient, http }, { celo }] = await Promise.all([
    import("viem"),
    import("viem/chains"),
  ]);
  const client = createPublicClient({ chain: celo, transport: http(config.rpcUrl) });
  return {
    async getReceipt(txHash: string) {
      try {
        const r = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        return {
          status: r.status,
          to: r.to,
          chainId: celo.id,
          logs: r.logs.map((l) => ({
            address: l.address,
            topics: l.topics as unknown as string[],
            data: l.data,
          })),
        };
      } catch {
        return null; // not mined yet, or RPC hiccup — caller retries
      }
    },
  };
}

export interface VerifyResult {
  row: OrderPaymentRow;
  outcome: "confirmed" | "failed" | "pending" | "noop";
}

export async function verifyOrderPayment(
  db: Database,
  paymentId: string,
  opts: { config?: OrderPaymentConfig; client?: ReceiptClient; now?: () => number } = {},
): Promise<VerifyResult> {
  const config = opts.config ?? readOrderPaymentConfig();
  const now = opts.now ?? Date.now;

  const row = await findOrderPaymentById(db, paymentId);
  if (!row) throw new Error(`order payment ${paymentId} not found`);
  if (row.status === "CONFIRMED") return { row, outcome: "noop" };
  if (row.status !== "SUBMITTED" && row.status !== "CONFIRMING") return { row, outcome: "noop" };
  if (!row.txHash) return { row, outcome: "noop" };

  // A concurrent expiry (terms changed) wins over a late confirmation.
  if (row.expiresAt.getTime() <= now() && row.status !== "CONFIRMING") {
    const expired = await updateOrderPayment(db, row.id, {
      status: "EXPIRED",
      error: "payment window elapsed",
    });
    return { row: expired, outcome: "failed" };
  }

  const attempts = row.verifyAttempts + 1;
  const client = opts.client ?? (await realClient(config));
  const receipt = await client.getReceipt(row.txHash);

  if (!receipt) {
    const patch: Partial<OrderPaymentRow> = { status: "CONFIRMING", verifyAttempts: attempts };
    if (attempts >= ORDER_PAYMENT_MAX_VERIFY_ATTEMPTS) {
      patch.error = "not confirmed on-chain after repeated checks; will keep checking on next open";
    }
    const pending = await updateOrderPayment(db, row.id, patch);
    if (row.status === "SUBMITTED") {
      await notify(db, { event: "order_payment.pending_verification", taskId: row.taskId });
    }
    return { row: pending, outcome: "pending" };
  }

  const failure = matchReceipt(receipt, row, config);
  if (failure) {
    const failed = await updateOrderPayment(db, row.id, {
      status: "FAILED",
      error: failure,
      verifyAttempts: attempts,
    });
    await appendAuditEvent(db, {
      type: "order_payment.failed",
      taskId: row.taskId,
      businessId: row.businessId,
      data: { paymentId: row.id, txHash: row.txHash, reason: failure },
    });
    await notify(db, { event: "order_payment.failed", taskId: row.taskId });
    safeForward({
      event: "payment_failed",
      actorKey: row.buyerSession,
      role: "buyer",
      props: { payment_method: "minipay", network: config.chainId, asset: row.asset },
      insertId: `payment_failed:${row.id}`,
    });
    return { row: failed, outcome: "failed" };
  }

  // Replay protection is layered and enforced before this point: the `tx_hash`
  // unique index binds a hash to exactly one intent, and the controller rejects
  // a hash already linked to another payment (TX_ALREADY_USED). `matchReceipt`
  // above additionally guarantees the transfer went to *this* intent's recipient
  // for *this* intent's amount, so a receipt for order A cannot confirm order B.
  // A row already CONFIRMED short-circuits at the top of this function.
  const payer = receipt.logs
    .filter((l) => eq(l.address, row.assetAddress) && eq(l.topics[0], TRANSFER_TOPIC))
    .map((l) => topicToAddress(l.topics[1]))[0];

  const confirmed = await updateOrderPayment(db, row.id, {
    status: "CONFIRMED",
    settledAt: new Date(now()),
    payerAddress: payer ?? null,
    error: null,
    verifyAttempts: attempts,
  });

  // Bind the real paying wallet to the commitment (used by the *handover*
  // attestation, which is written later — the commitment attestation was already
  // written at accept time and is not re-touched, M10.5 §28).
  if (payer) {
    const commitment = await findCommitmentByTaskId(db, row.taskId);
    if (commitment && (!commitment.buyerAddress || commitment.buyerAddress === OFF_CHAIN_ASSET)) {
      await updateCommitment(db, commitment.id, { buyerAddress: payer });
    }
  }

  await appendAuditEvent(db, {
    type: "order_payment.confirmed",
    taskId: row.taskId,
    businessId: row.businessId,
    quoteId: row.quoteId,
    data: {
      paymentId: row.id,
      txHash: row.txHash,
      chainId: row.chainId,
      asset: row.asset,
      amountAtomic: row.amountAtomic,
      recipient: row.recipientAddress,
      payer: payer ?? null,
    },
  });
  await notify(db, { event: "order_payment.confirmed", taskId: row.taskId });
  await notify(db, { event: "order_payment.received", taskId: row.taskId });
  safeForward({
    event: "payment_confirmed",
    actorKey: row.buyerSession,
    role: "buyer",
    props: { payment_method: "minipay", network: config.chainId, asset: row.asset },
    insertId: `payment_confirmed:${row.id}`,
  });

  return { row: confirmed, outcome: "confirmed" };
}

/** Returns a failure reason string, or null when the receipt matches the intent. */
function matchReceipt(
  receipt: OnChainReceipt,
  intent: OrderPaymentRow,
  config: OrderPaymentConfig,
): string | null {
  if (receipt.status !== "success") return "the payment transaction reverted on-chain";
  if (receipt.chainId != null && receipt.chainId !== config.chainId) {
    return `transaction is on chain ${receipt.chainId}, expected ${config.chainId}`;
  }
  if (!eq(receipt.to, intent.assetAddress)) {
    return "transaction did not call the expected stablecoin contract";
  }

  const transfers = receipt.logs.filter(
    (l) => eq(l.address, intent.assetAddress) && eq(l.topics[0], TRANSFER_TOPIC),
  );
  const toRecipient = transfers.filter((l) =>
    eq(topicToAddress(l.topics[2]), intent.recipientAddress),
  );
  if (toRecipient.length === 0) return "no stablecoin transfer to the business was found";
  if (toRecipient.length > 1) return "more than one transfer to the business in one transaction";

  const value = BigInt(toRecipient[0].data);
  const expected = BigInt(intent.amountAtomic);
  if (value !== expected) {
    return `paid ${value.toString()} but the agreed amount was ${expected.toString()}`;
  }
  return null;
}
