import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { QuoteRow, TaskRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { notify } from "@/features/notifications/service";
import { invalidateOrderPaymentsForTask } from "@/features/payments/order/intent";
import { findBusinessById } from "@/features/businesses/repository";
import { findRouteById } from "@/features/routes/repository";
import { findTaskById, listTaskQuotes } from "@/features/tasks/repository";
import { taskBelongsToSession } from "@/features/tasks/ownership";

import { quoteEffectiveStatus } from "./expiry";
import { buildOrderMessage } from "./order-message";
import { buildRecommendationSummary } from "./recommendation";
import {
  findRecommendationByTask,
  insertQuote,
  updateQuote,
  updateRecommendation,
} from "./repository";
import { quoteConfidenceSchema } from "./status";

/**
 * Changing a price, safely (milestone 5, §6).
 *
 * Businesses on Intra change prices — materials move, a job turns out bigger
 * than it read. The product has to allow that without ever letting an agreed
 * commercial term change underneath the buyer. Two different situations, two
 * different rules:
 *
 *   BEFORE the buyer accepts
 *     The business may replace its offer outright. The old row is SUPERSEDED,
 *     a new RECEIVED row takes its place, and the buyer decides on the new one.
 *     Any approval already in flight is invalidated, because the agent's
 *     `offerFingerprint` covers every priced term.
 *
 *   AFTER the buyer accepts
 *     The accepted row is immutable, full stop. The business can only PROPOSE a
 *     different price. The proposal is not in force: the accepted terms stand
 *     until the buyer explicitly accepts or refuses the change.
 *
 * There is deliberately no code path anywhere that edits the amount, currency,
 * turnaround or expiry of a row a buyer has accepted.
 */

export const reviseQuoteRequestSchema = z
  .object({
    taskId: z.string().min(1),
    amountMin: z.coerce.number().nonnegative(),
    amountMax: z.coerce.number().nonnegative().optional(),
    deliveryCharge: z.coerce.number().nonnegative().optional(),
    turnaround: z.string().trim().min(1).max(120),
    availabilityNote: z.string().trim().max(300).optional(),
    assumptions: z.string().trim().max(500).optional(),
    confidence: quoteConfidenceSchema.optional(),
    fixed: z.boolean().optional(),
    expiresAt: z.coerce.date().optional(),
    /** Why the price is changing. Shown to the buyer verbatim. */
    reason: z.string().trim().min(3, "Tell the customer why the price changed.").max(300),
  })
  .refine((value) => value.amountMax === undefined || value.amountMax >= value.amountMin, {
    message: "The maximum must be greater than or equal to the minimum.",
    path: ["amountMax"],
  });
export type ReviseQuoteRequest = z.infer<typeof reviseQuoteRequestSchema>;

export type RevisionOutcome =
  /** The buyer had not accepted yet — the new offer simply replaces the old one. */
  | { kind: "REPLACED"; quote: QuoteRow; superseded: QuoteRow; task: TaskRow }
  /** The buyer had accepted — this is a proposal they must decide on. */
  | { kind: "CHANGE_PROPOSED"; proposal: QuoteRow; accepted: QuoteRow; task: TaskRow };

/**
 * The offer currently in front of the buyer, if any.
 *
 * An EXPIRED offer still counts: a buyer is allowed to accept a lapsed price
 * (the order message then tells the printer to reconfirm). What is excluded is
 * anything closed — superseded, withdrawn, or a declined job.
 */
export function currentOffer(quotes: QuoteRow[]): QuoteRow | null {
  const live = quotes.filter((q) => q.status === "RECEIVED" || q.status === "EXPIRED");
  if (live.length === 0) return null;
  return live.reduce((best, q) => (q.revision > best.revision ? q : best));
}

/** A price change the business has proposed and the buyer has not decided on. */
export function pendingChange(quotes: QuoteRow[]): QuoteRow | null {
  return quotes.find((q) => q.status === "PROPOSED") ?? null;
}

/**
 * The offer the buyer accepted, if they have.
 *
 * Still the agreed row even if it has since lapsed — expiry does not un-agree
 * a price. Only being superseded or withdrawn takes a row out of force.
 */
export function acceptedOffer(quotes: QuoteRow[]): QuoteRow | null {
  return (
    quotes.find(
      (q) =>
        q.acceptedAt !== null &&
        q.status !== "SUPERSEDED" &&
        q.status !== "WITHDRAWN" &&
        q.status !== "DECLINED",
    ) ?? null
  );
}

async function loadContext(db: Database, routeId: string, taskId: string) {
  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");

  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (task.routeId && task.routeId !== routeId) {
    throw new HttpError(409, "TASK_ROUTE_MISMATCH", "This order belongs to a different service.");
  }

  const business = await findBusinessById(db, route.businessId);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "This service has no business.");

  return { route, task, business };
}

/**
 * The business sends a different price for a job it has already quoted.
 */
export async function reviseQuote(
  db: Database,
  routeId: string,
  input: ReviseQuoteRequest,
): Promise<RevisionOutcome> {
  const { route, task, business } = await loadContext(db, routeId, input.taskId);
  const quotes = await listTaskQuotes(db, task.id);

  if (quotes.length === 0) {
    throw new HttpError(
      409,
      "NO_QUOTE_TO_REVISE",
      "There is no quote on this order yet. Send your first price instead.",
    );
  }
  if (task.status === "FAILED" || task.status === "CANCELLED") {
    throw new HttpError(
      409,
      "ORDER_CLOSED",
      "This order is closed, so its price can no longer change.",
    );
  }
  if (pendingChange(quotes)) {
    throw new HttpError(
      409,
      "CHANGE_ALREADY_PENDING",
      "You already have a price change waiting for this customer's decision.",
    );
  }

  const accepted = acceptedOffer(quotes);
  const highestRevision = quotes.reduce((max, q) => Math.max(max, q.revision), 0);

  const terms = {
    taskId: task.id,
    routeId: route.id,
    amountMin: input.amountMin.toFixed(2),
    amountMax: input.amountMax?.toFixed(2) ?? null,
    deliveryCharge: input.deliveryCharge?.toFixed(2) ?? null,
    currency: route.quoteCurrency,
    turnaround: input.turnaround,
    availabilityNote: input.availabilityNote ?? null,
    assumptions: input.assumptions ?? null,
    confidence: input.confidence ?? null,
    fixed: input.fixed ?? false,
    expiresAt: input.expiresAt ?? null,
    revision: highestRevision + 1,
    changeReason: input.reason,
  };

  // --- After acceptance: propose only. The agreed row is never touched. -----
  if (accepted) {
    const proposal = await insertQuote(db, {
      ...terms,
      status: "PROPOSED",
      supersedesQuoteId: accepted.id,
    });
    await appendAuditEvent(db, {
      type: "quote.change_proposed",
      taskId: task.id,
      routeId: route.id,
      businessId: business.id,
      quoteId: proposal.id,
      data: {
        supersedes: accepted.id,
        agreedAmount: accepted.amountMin,
        proposedAmount: proposal.amountMin,
        currency: proposal.currency,
        reason: input.reason,
      },
    });
    await notify(db, { event: "quote.change_proposed", taskId: task.id, quoteId: proposal.id });
    return { kind: "CHANGE_PROPOSED", proposal, accepted, task };
  }

  // --- Before acceptance: replace outright. --------------------------------
  const previous = currentOffer(quotes);
  if (!previous) {
    throw new HttpError(409, "NO_LIVE_QUOTE", "There is no live offer on this order to replace.");
  }

  const replacement = await insertQuote(db, {
    ...terms,
    status: "RECEIVED",
    supersedesQuoteId: previous.id,
  });
  const superseded = await updateQuote(db, previous.id, { status: "SUPERSEDED" });

  const recommendation = await findRecommendationByTask(db, task.id);
  if (recommendation) {
    await updateRecommendation(db, recommendation.id, {
      quoteId: replacement.id,
      rationale: buildRecommendationSummary(replacement),
      confidence: replacement.confidence,
      orderMessage: buildOrderMessage(business, task, replacement),
    });
  }

  await appendAuditEvent(db, {
    type: "quote.revised",
    taskId: task.id,
    routeId: route.id,
    businessId: business.id,
    quoteId: replacement.id,
    data: {
      supersedes: previous.id,
      previousAmount: previous.amountMin,
      newAmount: replacement.amountMin,
      currency: replacement.currency,
      reason: input.reason,
    },
  });
  await notify(db, { event: "quote.revised", taskId: task.id, quoteId: replacement.id });

  // The order goes back to needing a decision — the buyer must see the new
  // price. It was already RECOMMENDED, so there is nothing to transition.
  const refreshed = (await findTaskById(db, task.id)) ?? task;
  return { kind: "REPLACED", quote: replacement, superseded, task: refreshed };
}

export const changeDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
});
export type ChangeDecision = z.infer<typeof changeDecisionSchema>;

export interface ChangeDecisionResult {
  decision: "ACCEPTED" | "DECLINED";
  /** The offer now in force. */
  inForce: QuoteRow;
  task: TaskRow;
}

/**
 * The buyer decides on a proposed price change. This is the only way a
 * different amount can ever take effect on an accepted order.
 */
export async function decideOnPriceChange(
  db: Database,
  taskId: string,
  sessionId: string,
  input: ChangeDecision,
): Promise<ChangeDecisionResult> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "FORBIDDEN", "This order belongs to a different session.");
  }

  const quotes = await listTaskQuotes(db, taskId);
  const proposal = pendingChange(quotes);
  if (!proposal) {
    throw new HttpError(
      409,
      "NO_PENDING_CHANGE",
      "There is no proposed price change on this order.",
    );
  }
  const accepted = acceptedOffer(quotes);
  if (!accepted) {
    throw new HttpError(409, "NO_ACCEPTED_QUOTE", "This order has no accepted price to change.");
  }

  const now = new Date();

  if (input.decision === "DECLINE") {
    const withdrawn = await updateQuote(db, proposal.id, { status: "WITHDRAWN" });
    await appendAuditEvent(db, {
      type: "quote.change_declined",
      taskId,
      quoteId: withdrawn.id,
      data: { keptAmount: accepted.amountMin, currency: accepted.currency },
    });
    // The originally agreed terms stand, untouched.
    return { decision: "DECLINED", inForce: accepted, task };
  }

  // Accepting the change: the previously agreed row is closed as SUPERSEDED
  // (never edited), and the proposal becomes the accepted offer.
  const supersededPrior = await updateQuote(db, accepted.id, { status: "SUPERSEDED" });
  const inForce = await updateQuote(db, proposal.id, { status: "RECEIVED", acceptedAt: now });

  const route = task.routeId ? await findRouteById(db, task.routeId) : null;
  const business = route ? await findBusinessById(db, route.businessId) : null;
  const recommendation = await findRecommendationByTask(db, taskId);
  if (recommendation && business) {
    await updateRecommendation(db, recommendation.id, {
      quoteId: inForce.id,
      rationale: buildRecommendationSummary(inForce),
      confidence: inForce.confidence,
      orderMessage: buildOrderMessage(business, task, inForce),
    });
  }

  await appendAuditEvent(db, {
    type: "quote.change_accepted",
    taskId,
    quoteId: inForce.id,
    data: {
      supersededQuoteId: supersededPrior.id,
      previousAmount: supersededPrior.amountMin,
      newAmount: inForce.amountMin,
      currency: inForce.currency,
    },
  });

  // The agreed amount changed — any MiniPay payment intent built on the old
  // amount is now invalid; a fresh approval mints a new one (M10.5 §11).
  await invalidateOrderPaymentsForTask(db, taskId);

  return { decision: "ACCEPTED", inForce, task };
}

/** What the buyer is shown about a proposed change. */
export interface PriceChangeView {
  proposedAmount: string;
  agreedAmount: string;
  currency: string;
  direction: "higher" | "lower" | "same";
  difference: string;
  turnaround: string;
  reason: string;
  proposedAt: string;
  /** True once the agreed price has lapsed as well. */
  agreedExpired: boolean;
}

export function priceChangeView(
  proposal: QuoteRow,
  accepted: QuoteRow,
  now: Date = new Date(),
): PriceChangeView {
  const proposed = Number(proposal.amountMin);
  const agreed = Number(accepted.amountMin);
  const delta = proposed - agreed;
  return {
    proposedAmount: proposal.amountMin,
    agreedAmount: accepted.amountMin,
    currency: proposal.currency,
    direction: delta > 0 ? "higher" : delta < 0 ? "lower" : "same",
    difference: Math.abs(delta).toFixed(2),
    turnaround: proposal.turnaround,
    reason: proposal.changeReason ?? "",
    proposedAt: proposal.createdAt.toISOString(),
    agreedExpired: quoteEffectiveStatus(accepted, now) === "EXPIRED",
  };
}
