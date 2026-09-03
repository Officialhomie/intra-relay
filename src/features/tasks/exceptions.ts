import type { TaskRow } from "@/lib/db/schema";

/**
 * When an order does not reach a clean handover (milestone 6 §18).
 *
 * Every case a person can hit is named semantically, not by an internal status,
 * and each answers the same three questions: what happened, whether you need to
 * do anything, and what happens next. None of them invents a financial
 * outcome — Intra never held the money, so the only honest statement is that
 * nothing was charged through Intra and any direct arrangement is between the
 * two parties (CLAUDE.md §4.1, §4.3).
 */

export type TaskExceptionReason =
  | "SUPPLIER_DECLINED" // provider said no before quoting
  | "PROVIDER_WITHDREW" // provider pulled a quote the buyer had not agreed
  | "PROVIDER_WITHDREW_AFTER_AGREEMENT" // provider pulled out after the buyer agreed
  | "PROVIDER_CANNOT_FULFILL" // provider agreed, then could not do the job
  | "HANDOVER_FAILED" // the pickup / handover did not complete
  | "BUYER_CANCELLED" // buyer cancelled before agreeing
  | "BUYER_CANCELLED_AFTER_AGREEMENT" // buyer cancelled an agreed order
  | "ROUTE_UNAVAILABLE" // the service was not actually available
  | "NO_VIABLE_OFFER"; // nothing usable came back

export interface TaskExceptionView {
  reason: TaskExceptionReason;
  /** Whose action caused this, for tone — never a blame label shown raw. */
  origin: "provider" | "buyer" | "system";
  /** Plain, short: what the person is looking at. */
  headline: string;
  /** One or two sentences: what actually happened. */
  whatHappened: string;
  /** Null when there is nothing for the person to do. */
  actionNeeded: string | null;
  /** What the order does now, and what the person can do next. */
  whatNext: string;
  /** The money position — always true, never speculative. */
  moneyNote: string;
}

const NOTHING_THROUGH_INTRA =
  "Nothing was charged through Intra. If you had paid the business directly, sort that out with them.";
const NOTHING_MOVED = "No money moved. Nothing was ordered.";

const EXCEPTIONS: Record<TaskExceptionReason, Omit<TaskExceptionView, "reason">> = {
  SUPPLIER_DECLINED: {
    origin: "provider",
    headline: "The business turned this request down",
    whatHappened:
      "The business you asked said it can't take this job — usually because of the area, the timing or how busy it is.",
    actionNeeded: "Start a new request and I'll look for another business.",
    whatNext: "This request is closed. Your details were not shared any further.",
    moneyNote: NOTHING_MOVED,
  },
  PROVIDER_WITHDREW: {
    origin: "provider",
    headline: "The business pulled its quote",
    whatHappened:
      "The business withdrew the price it had sent, before you agreed to it. That can happen if their costs or availability changed.",
    actionNeeded: "Start a new request to get fresh quotes.",
    whatNext: "This request is closed. You had not agreed anything, so nothing is owed.",
    moneyNote: NOTHING_MOVED,
  },
  PROVIDER_WITHDREW_AFTER_AGREEMENT: {
    origin: "provider",
    headline: "The business can no longer honour the price you agreed",
    whatHappened:
      "After you agreed the price, the business said it can't proceed at that price or at all.",
    actionNeeded: "Start a new request if you still need the job done.",
    whatNext:
      "This order is closed. The price you agreed is still on record, but the business is not going ahead.",
    moneyNote: NOTHING_THROUGH_INTRA,
  },
  PROVIDER_CANNOT_FULFILL: {
    origin: "provider",
    headline: "The business can't complete the job",
    whatHappened:
      "The business agreed the job but has now said it can't finish it — for example a machine is down or materials ran out.",
    actionNeeded: "Start a new request and I'll find another business.",
    whatNext: "This order is closed.",
    moneyNote: NOTHING_THROUGH_INTRA,
  },
  HANDOVER_FAILED: {
    origin: "system",
    headline: "The handover didn't go through",
    whatHappened:
      "The pickup or handover for this order wasn't completed — the code didn't match, or one side reported a problem.",
    actionNeeded:
      "Contact the business directly to sort out the collection. If it's resolved, they can mark it ready again.",
    whatNext:
      "The order is still on record as agreed. It is not marked complete and no completion record was written.",
    moneyNote: NOTHING_THROUGH_INTRA,
  },
  BUYER_CANCELLED: {
    origin: "buyer",
    headline: "You cancelled this request",
    whatHappened: "You chose not to go ahead with this request.",
    actionNeeded: null,
    whatNext: "The request is closed. You can start a new one any time.",
    moneyNote: NOTHING_MOVED,
  },
  BUYER_CANCELLED_AFTER_AGREEMENT: {
    origin: "buyer",
    headline: "You cancelled this order",
    whatHappened: "You cancelled after agreeing the price. The business has been notified.",
    actionNeeded: "If the business had already started, contact them directly about anything owed.",
    whatNext: "The order is closed.",
    moneyNote: NOTHING_THROUGH_INTRA,
  },
  ROUTE_UNAVAILABLE: {
    origin: "system",
    headline: "That service wasn't available",
    whatHappened:
      "The service you asked for wasn't actually open for requests when this was submitted.",
    actionNeeded: "Try again shortly, or ask an operator to check the business is active.",
    whatNext: "This request is closed.",
    moneyNote: NOTHING_MOVED,
  },
  NO_VIABLE_OFFER: {
    origin: "system",
    headline: "No usable quote came back",
    whatHappened:
      "The businesses that were asked either didn't respond in time or couldn't offer terms that fit your request.",
    actionNeeded: "Adjust the details — the deadline or area — and try again.",
    whatNext: "This request is closed.",
    moneyNote: NOTHING_MOVED,
  },
};

/** Map a stored `failureReason` / decline onto a semantic reason. */
function reasonFor(task: Pick<TaskRow, "status" | "failureReason">): TaskExceptionReason | null {
  if (task.status === "CANCELLED") {
    return task.failureReason === "BUYER_CANCELLED_AFTER_AGREEMENT"
      ? "BUYER_CANCELLED_AFTER_AGREEMENT"
      : "BUYER_CANCELLED";
  }
  if (task.status !== "FAILED") return null;
  const raw = task.failureReason ?? "";
  if (raw in EXCEPTIONS) return raw as TaskExceptionReason;
  return "NO_VIABLE_OFFER";
}

/**
 * The semantic view of an order that ended in an exception, or null for an
 * order that is still live or completed cleanly.
 */
export function describeTaskException(
  task: Pick<TaskRow, "status" | "failureReason">,
): TaskExceptionView | null {
  const reason = reasonFor(task);
  if (!reason) return null;
  return { reason, ...EXCEPTIONS[reason] };
}

export const PROVIDER_EXCEPTION_REASONS: readonly TaskExceptionReason[] = [
  "PROVIDER_WITHDREW",
  "PROVIDER_WITHDREW_AFTER_AGREEMENT",
  "PROVIDER_CANNOT_FULFILL",
];
