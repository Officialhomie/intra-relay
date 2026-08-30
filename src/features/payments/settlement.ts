import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow, ServicePaymentRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";

import type { FailedResult, SettledResult } from "./adapter/types";
import { assertSettlement } from "./lifecycle";
import { insertServicePayment } from "./repository";

/**
 * Write an **immutable** SETTLED receipt for a verified on-chain payment.
 * `assertSettlement` is a hard guard: no tx hash + verification, no row.
 * The audit event records the receipt metadata — never the authorisation payload.
 */
export async function recordSettledReceipt(
  db: Database,
  input: { route: QuoteRouteRow; taskId: string; result: SettledResult },
): Promise<ServicePaymentRow> {
  assertSettlement({ txHash: input.result.txHash, verification: input.result.verification });

  const payment = await insertServicePayment(db, {
    taskId: input.taskId,
    routeId: input.route.id,
    service: "quote-route",
    resource: input.route.endpoint,
    maxFeeUsd: input.route.queryFeeUsd,
    provider: input.result.provider,
    network: input.result.network,
    assetSymbol: input.result.assetSymbol,
    amountAtomic: input.result.amountAtomic,
    payer: input.result.payer || null,
    payee: input.result.payee || null,
    status: "SETTLED",
    txHash: input.result.txHash,
    authorizationKey: input.result.authorizationKey,
    attributionTag: input.result.attributionTag,
    verification: input.result.verification,
    settledAt: new Date(),
  });

  await appendAuditEvent(db, {
    type: "payment.settled",
    taskId: input.taskId,
    routeId: input.route.id,
    paymentId: payment.id,
    data: {
      provider: input.result.provider,
      txHash: input.result.txHash,
      network: input.result.network,
      amountAtomic: input.result.amountAtomic,
      assetSymbol: input.result.assetSymbol,
      attributionTag: input.result.attributionTag,
    },
  });

  return payment;
}

/** Immutable record of a failed payment attempt — preserved for audit (FR-PAY-004). */
export async function recordFailedPayment(
  db: Database,
  input: { route: QuoteRouteRow; result: FailedResult },
): Promise<ServicePaymentRow> {
  const payment = await insertServicePayment(db, {
    routeId: input.route.id,
    service: "quote-route",
    resource: input.route.endpoint,
    maxFeeUsd: input.route.queryFeeUsd,
    provider: input.result.provider,
    status: "FAILED",
    authorizationKey: input.result.authorizationKey ?? null,
    errorCode: input.result.code,
    verification: {
      code: input.result.code,
      reason: input.result.reason,
      recordedAt: new Date().toISOString(),
    },
  });

  await appendAuditEvent(db, {
    type: "payment.failed",
    routeId: input.route.id,
    paymentId: payment.id,
    data: { provider: input.result.provider, code: input.result.code, reason: input.result.reason },
  });

  return payment;
}

export async function recordChallengeIssued(
  db: Database,
  input: {
    route: QuoteRouteRow;
    businessId: string;
    amountAtomic: string;
    assetSymbol: string;
    network: string;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    type: "payment.challenge_issued",
    routeId: input.route.id,
    businessId: input.businessId,
    data: {
      amountAtomic: input.amountAtomic,
      assetSymbol: input.assetSymbol,
      network: input.network,
    },
  });
}
