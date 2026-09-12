/**
 * Determines the single dominant "what now" action for a task, from the same
 * fields `TaskPage` already reads off `getTaskView` — never a new source of
 * truth, just a priority order over existing state (frontend audit D1).
 *
 * Priority: a pending price change or a closed/exception task always wins
 * (nothing else matters until it's resolved); then a pickup waiting on the
 * buyer's confirmation; then closing an agreed order (pay and/or message the
 * business); then a quote waiting on the buyer's decision; then completion;
 * then the plain wait for a first quote.
 */
export type NextActionKind =
  "price_change" | "exception" | "pickup" | "close_order" | "decision" | "completed" | "waiting";

export interface NextActionView {
  task: { status: string };
  recommendation: unknown;
  priceChange: unknown;
  exception: unknown;
  handoffConfirmedAt: string | null;
  proofline: { evidenceStatus: string } | null;
}

export interface NextAction {
  kind: NextActionKind;
  eyebrow: string;
  headline: string;
  description: string;
}

export function nextAction(view: NextActionView): NextAction {
  if (view.priceChange) {
    return {
      kind: "price_change",
      eyebrow: "What now",
      headline: "The business proposed a different price",
      description: "Review it against what you agreed, then decide.",
    };
  }

  if (view.exception) {
    return {
      kind: "exception",
      eyebrow: "What now",
      headline: "This request is closed",
      description: "Here's what happened and what you can do next.",
    };
  }

  if (view.proofline?.evidenceStatus === "MERCHANT_MARKED_READY") {
    return {
      kind: "pickup",
      eyebrow: "What now",
      headline: "Your order is ready for pickup",
      description: "Confirm once you've collected it from the business.",
    };
  }

  if (view.task.status === "HANDOFF_READY" && !view.handoffConfirmedAt) {
    return {
      kind: "close_order",
      eyebrow: "What now",
      headline: "Close the order with the business",
      description:
        "Pay through the app, or message them directly — either way, let us know once it's sent.",
    };
  }

  if (view.task.status === "RECOMMENDED" && view.recommendation) {
    return {
      kind: "decision",
      eyebrow: "What now",
      headline: "Review the quote and decide",
      description: "This is your call — nothing is ordered or paid until you choose.",
    };
  }

  if (view.handoffConfirmedAt) {
    return {
      kind: "completed",
      eyebrow: "All done",
      headline: "You've sent your order",
      description: "Nothing more is needed from you right now.",
    };
  }

  return {
    kind: "waiting",
    eyebrow: "What now",
    headline: "Waiting for the business to respond",
    description: "We'll let you know the moment a price comes back.",
  };
}
