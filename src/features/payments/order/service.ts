/**
 * Read model for the buyer's order payment (M10.5 §7, §24, §29, ADR-023).
 *
 * The public DTO carries exactly what a person needs to know what they are
 * authorising — business, service, agreed naira amount, the USDC equivalent
 * with its reference rate + timestamp, the recipient (shortened), and the
 * current status. No intent id crosses to the client for anything but the
 * session-gated task view; no signature or key is ever present.
 */
import type { Database } from "@/lib/db/client";
import type { OrderPaymentRow } from "@/lib/db/schema";
import { explorerTxUrl } from "@/features/payments/adapter/networks";

import { readOrderPaymentConfig, type OrderPaymentConfig } from "./config";
import { formatUsdcAtomic } from "./rate";
import {
  findConfirmedOrderPaymentByCommitment,
  findLatestOrderPaymentByTaskId,
} from "./repository";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { commitmentIsExpired } from "@/features/commitments/status";
import { findTaskById } from "@/features/tasks/repository";
import { isOrderPaymentTerminal } from "./status";

export interface PublicOrderPayment {
  /** null until the buyer starts one; the UI still shows the "pay" affordance from `offered`. */
  status: OrderPaymentRow["status"] | null;
  /** True when the MiniPay path can be started for this order right now. */
  offered: boolean;
  /** True once the server has verified a real on-chain settlement. */
  paid: boolean;
  network: string;
  chainId: number;
  asset: string;
  assetAddress: string;
  recipientAddress: string | null;
  /** e.g. "0x1234…abcd" for display. */
  recipientShort: string | null;
  amountAtomic: string | null;
  amountUsdcDisplay: string | null;
  amountNgnMinor: string | null;
  ngnUsdRate: string | null;
  rateSource: string | null;
  rateLockedAt: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  /** Why the path is unavailable, when it is. */
  reason: string | null;
  expiresAt: string | null;
}

const CAIP2 = (chainId: number) => `eip155:${chainId}`;

function shorten(addr: string | null): string | null {
  return addr && addr.length >= 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function toPublicOrderPayment(
  row: OrderPaymentRow,
  config: OrderPaymentConfig = readOrderPaymentConfig(),
): PublicOrderPayment {
  const network = CAIP2(row.chainId);
  return {
    status: row.status,
    offered: row.status === "CONFIRMED" ? false : !isOrderPaymentTerminal(row.status),
    paid: row.status === "CONFIRMED",
    network,
    chainId: row.chainId,
    asset: row.asset,
    assetAddress: row.assetAddress,
    recipientAddress: row.recipientAddress,
    recipientShort: shorten(row.recipientAddress),
    amountAtomic: row.amountAtomic,
    amountUsdcDisplay: formatUsdcAtomic(BigInt(row.amountAtomic)),
    amountNgnMinor: row.amountNgnMinor,
    ngnUsdRate: row.ngnUsdRate,
    rateSource: row.rateSource,
    rateLockedAt: row.rateLockedAt.toISOString(),
    txHash: row.txHash,
    explorerUrl: row.txHash ? explorerTxUrl(network, row.txHash) : null,
    reason: config.enabled ? null : config.reason,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * The order-payment view for a task, for `getTaskView`. Returns null when the
 * order is not at a payable stage. When payable but not yet started, returns a
 * shell describing whether MiniPay can be offered.
 */
export async function getOrderPaymentForTask(
  db: Database,
  taskId: string,
  config: OrderPaymentConfig = readOrderPaymentConfig(),
): Promise<PublicOrderPayment | null> {
  const task = await findTaskById(db, taskId);
  if (!task || task.status !== "HANDOFF_READY") return null;

  const existing = await findLatestOrderPaymentByTaskId(db, taskId);
  if (existing && (existing.status === "CONFIRMED" || !isOrderPaymentTerminal(existing.status))) {
    return toPublicOrderPayment(existing, config);
  }

  const commitment = await findCommitmentByTaskId(db, taskId);
  if (!commitment) return null;

  const confirmed = await findConfirmedOrderPaymentByCommitment(db, commitment.id);
  if (confirmed) return toPublicOrderPayment(confirmed, config);

  const expired = commitmentIsExpired(commitment.validUntil);
  const offered = config.enabled && !expired;

  return {
    status: existing ? existing.status : null,
    offered,
    paid: false,
    network: CAIP2(config.chainId),
    chainId: config.chainId,
    asset: config.asset,
    assetAddress: config.assetAddress,
    recipientAddress: commitment.providerAddress,
    recipientShort: shorten(commitment.providerAddress),
    amountAtomic: null,
    amountUsdcDisplay: null,
    amountNgnMinor: commitment.amountMinor,
    ngnUsdRate: null,
    rateSource: null,
    rateLockedAt: null,
    txHash: null,
    explorerUrl: null,
    reason: !config.enabled
      ? config.reason
      : expired
        ? "The agreed offer has expired. Ask the business to reconfirm the price."
        : null,
    expiresAt: null,
  };
}
