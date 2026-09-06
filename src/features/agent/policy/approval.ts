import type { DecisionReason } from "../types";
import type { OfferSelection } from "./offers";

/**
 * The human-approval gate (BR-001, FR-REC-002, ADR-003).
 *
 * The agent may discover, compare, reason and recommend autonomously. It may
 * not place the final order or move the buyer's money. This module is the one
 * place that decides whether the run is allowed to proceed past a
 * recommendation, and it is deliberately impossible to satisfy by accident:
 * `approvalGranted` must be an explicit human act carrying the exact
 * `offerFingerprint` that was shown to them.
 */

export type ApprovalOutcome =
  | { allowed: false; code: "HUMAN_APPROVAL_REQUIRED"; card: ApprovalCard }
  | { allowed: false; code: "NOTHING_TO_APPROVE"; card: null; statement: string }
  | { allowed: false; code: "APPROVAL_STALE"; card: ApprovalCard; statement: string }
  | { allowed: true; card: ApprovalCard };

/** Exactly what the human is shown before they approve. No hidden terms. */
export interface ApprovalCard {
  businessName: string;
  businessSlug: string;
  taskId: string;
  price: string;
  priceBasis: "fixed price" | "estimate";
  turnaround: string;
  expiresAt: string | null;
  selectionReason: string;
  uncertainties: string[];
  /** Binds an approval to the precise offer shown. */
  offerFingerprint: string;
  finalOrderStatement: string;
}

export const FINAL_ORDER_STATEMENT =
  "Approving records your decision and reveals a pre-filled WhatsApp message. " +
  "Intra does not send it, does not place the order, and never moves your money — " +
  "you send the message and pay the printer directly.";

/**
 * Identifies the exact offer the human saw. If the quote is re-fetched and any
 * term moved, the fingerprint changes and a prior approval no longer applies.
 */
export function offerFingerprint(input: {
  taskId: string;
  businessSlug: string;
  currency: string;
  amountMin: number;
  amountMax: number | null;
  deliveryCharge: number | null;
  turnaround: string;
  expiresAt: string | null;
}): string {
  return [
    input.taskId,
    input.businessSlug,
    input.currency,
    input.amountMin,
    input.amountMax ?? "-",
    input.deliveryCharge ?? "-",
    input.turnaround.trim().toLowerCase(),
    input.expiresAt ?? "-",
  ].join("|");
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function buildApprovalCard(selection: OfferSelection): ApprovalCard | null {
  const chosen = selection.selected;
  if (!chosen) return null;

  const { offer } = chosen;
  const price =
    chosen.totalMax != null && chosen.totalMax !== chosen.totalMin
      ? `${money(offer.currency, chosen.totalMin)}–${money(offer.currency, chosen.totalMax)}`
      : money(offer.currency, chosen.totalMin);

  return {
    businessName: offer.businessName,
    businessSlug: offer.businessSlug,
    taskId: offer.taskId,
    price,
    priceBasis: offer.fixed ? "fixed price" : "estimate",
    turnaround: offer.turnaround,
    expiresAt: offer.expiresAt,
    selectionReason: selection.selectionReason,
    uncertainties: selection.uncertainties,
    offerFingerprint: offerFingerprint({
      taskId: offer.taskId,
      businessSlug: offer.businessSlug,
      currency: offer.currency,
      amountMin: offer.amountMin,
      amountMax: offer.amountMax,
      deliveryCharge: offer.deliveryCharge,
      turnaround: offer.turnaround,
      expiresAt: offer.expiresAt,
    }),
    finalOrderStatement: FINAL_ORDER_STATEMENT,
  };
}

/**
 * The gate. Called before any step that would commit the buyer to a purchase.
 *
 * @param approval  What the human actually did, if anything. `null` means they
 *                  have not been asked yet or have not answered.
 */
export function evaluateApproval(
  selection: OfferSelection,
  approval: { granted: boolean; offerFingerprint: string } | null,
): ApprovalOutcome {
  const card = buildApprovalCard(selection);
  if (!card) {
    return {
      allowed: false,
      code: "NOTHING_TO_APPROVE",
      card: null,
      statement: selection.selectionReason,
    };
  }
  if (!approval || !approval.granted) {
    return { allowed: false, code: "HUMAN_APPROVAL_REQUIRED", card };
  }
  // An approval only counts for the offer it was given against. If the quote
  // moved underneath it, the human must look again.
  if (approval.offerFingerprint !== card.offerFingerprint) {
    return {
      allowed: false,
      code: "APPROVAL_STALE",
      card,
      statement:
        "The quote changed after you approved it, so that approval no longer applies. " +
        "Review the current offer and approve again.",
    };
  }
  return { allowed: true, card };
}

export function approvalReason(outcome: ApprovalOutcome): DecisionReason {
  if (outcome.allowed) {
    return {
      code: "APPROVED",
      statement: `The buyer approved ${outcome.card.businessName} at ${outcome.card.price}.`,
    };
  }
  if (outcome.code === "HUMAN_APPROVAL_REQUIRED") {
    return {
      code: outcome.code,
      statement: `Stopped for human approval: ${outcome.card.selectionReason}`,
    };
  }
  return { code: outcome.code, statement: outcome.statement };
}
