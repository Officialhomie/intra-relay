import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow, ServicePaymentRow } from "@/lib/db/schema";
import { appendAuditEvent } from "@/features/audit/repository";

import type {
  FailedResult,
  IndeterminateResult,
  SettledResult,
  UnavailableResult,
} from "./adapter/types";
import { assertSettlement } from "./lifecycle";
import { insertOrGetByAuthorizationKey } from "./repository";

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

  const payment = await insertOrGetByAuthorizationKey(db, {
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

  // A concurrent request already recorded this authorisation — return its row,
  // do not write a second audit event.
  if (payment.txHash !== input.result.txHash || payment.status !== "SETTLED") {
    return payment;
  }

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
  const payment = await insertOrGetByAuthorizationKey(db, {
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

  // A concurrent request settled this authorisation first — return its row.
  if (payment.status !== "FAILED") return payment;

  await appendAuditEvent(db, {
    type: "payment.failed",
    routeId: input.route.id,
    paymentId: payment.id,
    data: { provider: input.result.provider, code: input.result.code, reason: input.result.reason },
  });

  return payment;
}

/**
 * Immutable record of an INDETERMINATE settlement (FR-PAY-007) — `verify`
 * passed but `settle` did not confirm. Status `AUTHORISED`: verification is
 * real, only the on-chain outcome is unknown. No tx hash is ever written.
 */
export async function recordIndeterminatePayment(
  db: Database,
  input: { route: QuoteRouteRow; result: IndeterminateResult },
): Promise<ServicePaymentRow> {
  const payment = await insertOrGetByAuthorizationKey(db, {
    routeId: input.route.id,
    service: "quote-route",
    resource: input.route.endpoint,
    maxFeeUsd: input.route.queryFeeUsd,
    provider: input.result.provider,
    status: "AUTHORISED",
    authorizationKey: input.result.authorizationKey,
    errorCode: input.result.code,
    verification: input.result.verification,
  });

  if (payment.status !== "AUTHORISED") return payment;

  await appendAuditEvent(db, {
    type: "payment.indeterminate",
    routeId: input.route.id,
    paymentId: payment.id,
    data: { provider: input.result.provider, code: input.result.code, reason: input.result.reason },
  });

  return payment;
}

/**
 * Immutable record of an UNAVAILABLE payment attempt (FR-PAY-004, FR-PAY-006) —
 * verification could not be obtained (no facilitator, config error, or the
 * facilitator was unreachable). Not the agent's fault; no tx hash.
 */
export async function recordUnavailablePayment(
  db: Database,
  input: { route: QuoteRouteRow; result: UnavailableResult },
): Promise<ServicePaymentRow> {
  // No unique `authorizationKey` on this row: verification never happened, so a
  // retry after infra recovers must not be blocked. The key hash is kept in the
  // audit body for tracing only.
  const payment = await insertOrGetByAuthorizationKey(db, {
    routeId: input.route.id,
    service: "quote-route",
    resource: input.route.endpoint,
    maxFeeUsd: input.route.queryFeeUsd,
    provider: input.result.provider,
    status: "UNAVAILABLE",
    authorizationKey: null,
    errorCode: input.result.code ?? "PAYMENT_SERVICE_UNAVAILABLE",
    verification: {
      code: input.result.code ?? "PAYMENT_SERVICE_UNAVAILABLE",
      reason: input.result.reason,
      authorizationKeyHash: input.result.authorizationKey ?? null,
      recordedAt: new Date().toISOString(),
    },
  });

  if (payment.status !== "UNAVAILABLE") return payment;

  await appendAuditEvent(db, {
    type: "payment.unavailable",
    routeId: input.route.id,
    paymentId: payment.id,
    data: {
      provider: input.result.provider,
      code: input.result.code ?? null,
      reason: input.result.reason,
    },
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
