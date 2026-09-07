/**
 * The deterministic order-payment controller — intent creation (M10.5, ADR-023).
 *
 * This is the ONLY way a payment intent is born, and it is NOT a model tool
 * (M10.5 §3, §35). The recipient, amount and asset come exclusively from the
 * server-authoritative accepted commitment — never from the client, the LLM, or
 * free-form text (§8, §9). The client's only input downstream is a tx hash.
 */
import type { Database } from "@/lib/db/client";
import type { OrderPaymentRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { commitmentIsExpired } from "@/features/commitments/status";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { findTaskById } from "@/features/tasks/repository";
import { taskBelongsToSession } from "@/features/tasks/ownership";

import { readOrderPaymentConfig, type OrderPaymentConfig } from "./config";
import {
  convertNgnMinorToUsdcAtomic,
  fetchNgnUsdRate,
  RateUnavailableError,
  type NgnUsdRate,
} from "./rate";
import {
  expireLiveOrderPaymentsForCommitment,
  findConfirmedOrderPaymentByCommitment,
  findLiveOrderPaymentByCommitment,
  insertOrderPayment,
} from "./repository";
import { ORDER_PAYMENT_WINDOW_MS } from "./status";

export interface CreateIntentDeps {
  config?: OrderPaymentConfig;
  fetchRate?: (url: string) => Promise<NgnUsdRate>;
  now?: () => number;
}

export async function createOrderPaymentIntent(
  db: Database,
  taskId: string,
  sessionId: string,
  deps: CreateIntentDeps = {},
): Promise<OrderPaymentRow> {
  const config = deps.config ?? readOrderPaymentConfig();
  const now = deps.now ?? Date.now;

  if (!config.enabled || !config.assetAddress) {
    throw new HttpError(503, "PAYMENT_METHOD_UNAVAILABLE", config.reason);
  }

  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "TASK_FORBIDDEN", "This order belongs to another device.");
  }
  if (task.status !== "HANDOFF_READY") {
    throw new HttpError(
      409,
      "OFFER_NOT_ACCEPTED",
      "You can only pay once you have accepted the business's offer.",
    );
  }

  const commitment = await findCommitmentByTaskId(db, task.id);
  if (!commitment) {
    throw new HttpError(409, "NO_COMMITMENT", "This order has no accepted commitment to pay for.");
  }
  if (commitmentIsExpired(commitment.validUntil, new Date(now()))) {
    throw new HttpError(
      409,
      "COMMITMENT_EXPIRED",
      "The agreed offer has expired. Ask the business to reconfirm the price.",
    );
  }

  const alreadyPaid = await findConfirmedOrderPaymentByCommitment(db, commitment.id);
  if (alreadyPaid) return alreadyPaid;

  const live = await findLiveOrderPaymentByCommitment(db, commitment.id);
  if (live) {
    // A still-valid intent for the same terms — hand it back rather than mint a
    // second one (§20 duplicate protection).
    if (live.expiresAt.getTime() > now()) return live;
    await expireLiveOrderPaymentsForCommitment(db, commitment.id);
  }

  let rate: NgnUsdRate;
  try {
    rate = await (deps.fetchRate ?? fetchNgnUsdRate)(config.rateUrl);
  } catch (error) {
    if (error instanceof RateUnavailableError) {
      throw new HttpError(
        503,
        "PAYMENT_METHOD_UNAVAILABLE",
        "We can't get a reliable naira-to-dollar rate right now. Use the WhatsApp handoff, or try paying again shortly.",
      );
    }
    throw error;
  }

  const ngnMinor = BigInt(commitment.amountMinor);
  const amountAtomic = convertNgnMinorToUsdcAtomic(ngnMinor, rate.rate);

  const row = await insertOrderPayment(db, {
    taskId: task.id,
    quoteId: commitment.quoteId,
    commitmentId: commitment.id,
    buyerSession: sessionId,
    businessId: commitment.businessId,
    recipientAddress: commitment.providerAddress,
    chainId: config.chainId,
    asset: config.asset,
    assetAddress: config.assetAddress,
    amountAtomic: amountAtomic.toString(),
    amountNgnMinor: commitment.amountMinor,
    ngnUsdRate: rate.rate.toString(),
    rateSource: rate.source,
    rateLockedAt: rate.fetchedAt,
    status: "CREATED",
    expiresAt: new Date(now() + ORDER_PAYMENT_WINDOW_MS),
  });

  await appendAuditEvent(db, {
    type: "order_payment.created",
    taskId: task.id,
    businessId: commitment.businessId,
    quoteId: commitment.quoteId,
    data: {
      paymentId: row.id,
      asset: row.asset,
      amountAtomic: row.amountAtomic,
      amountNgnMinor: row.amountNgnMinor,
      ngnUsdRate: row.ngnUsdRate,
      rateSource: row.rateSource,
      chainId: row.chainId,
    },
  });

  return row;
}

/**
 * Called when the commercial terms change (a quote is revised or the order is
 * cancelled): every live intent for the commitment is invalidated so a stale
 * amount can never be paid. A fresh human approval mints a new one (§11).
 * Never throws into its caller — a payment-intent housekeeping failure must not
 * block the terms change itself.
 */
export async function invalidateOrderPaymentsForCommitment(
  db: Database,
  commitmentId: string,
): Promise<void> {
  try {
    const expired = await expireLiveOrderPaymentsForCommitment(db, commitmentId);
    if (expired.length > 0) {
      await appendAuditEvent(db, {
        type: "order_payment.invalidated",
        taskId: expired[0].taskId,
        businessId: expired[0].businessId,
        data: { commitmentId, count: expired.length, reason: "commercial terms changed" },
      });
    }
  } catch {
    /* housekeeping only */
  }
}

/** Task-keyed convenience for the terms-change / exception call sites. */
export async function invalidateOrderPaymentsForTask(db: Database, taskId: string): Promise<void> {
  try {
    const commitment = await findCommitmentByTaskId(db, taskId);
    if (commitment) await invalidateOrderPaymentsForCommitment(db, commitment.id);
  } catch {
    /* housekeeping only */
  }
}
