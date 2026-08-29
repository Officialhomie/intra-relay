import { HttpError } from "@/lib/http/response";

import type { PaymentStatus } from "./status";

/**
 * Agent service-payment lifecycle (F-PAY, ADR-004).
 *
 *   NOT_REQUIRED ─▶ REQUESTED_402 ─▶ AUTHORISED ─▶ SETTLED
 *        │                 │              └────────▶ FAILED
 *        └────▶ UNAVAILABLE ◀───────────────────────┘
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  NOT_REQUIRED: ["REQUESTED_402", "UNAVAILABLE"],
  REQUESTED_402: ["AUTHORISED", "FAILED", "UNAVAILABLE"],
  AUTHORISED: ["SETTLED", "FAILED"],
  SETTLED: [],
  FAILED: [],
  UNAVAILABLE: ["REQUESTED_402"],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new HttpError(
      409,
      "INVALID_PAYMENT_TRANSITION",
      `A payment cannot move from ${from} to ${to}.`,
    );
  }
}

export interface SettlementEvidence {
  txHash?: string | null;
  verification?: unknown;
}

/**
 * A payment may only be marked SETTLED with a real facilitator verification
 * result AND a mainnet transaction hash (FR-PAY-003, BR-005). Manual receipts
 * are impossible by construction.
 */
export function assertSettlement(evidence: SettlementEvidence): void {
  const hasTxHash =
    typeof evidence.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(evidence.txHash);
  const hasVerification =
    evidence.verification != null &&
    typeof evidence.verification === "object" &&
    Object.keys(evidence.verification as object).length > 0;

  if (!hasTxHash || !hasVerification) {
    throw new HttpError(
      409,
      "SETTLEMENT_UNVERIFIED",
      "A payment can only be SETTLED with a verified facilitator result and a mainnet transaction hash.",
    );
  }
}

/** True when no x402 facilitator is configured (FR-PAY-004). */
export function facilitatorConfigured(): boolean {
  return Boolean(process.env.X402_FACILITATOR_URL && process.env.X402_FACILITATOR_KEY);
}
