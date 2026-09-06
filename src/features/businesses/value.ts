import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { prooflineEvents, quoteRoutes, quotes, tasks } from "@/lib/db/schema";

/**
 * "What is this actually doing for my business?" (milestone 5 §7, §18).
 *
 * Every number here is counted from rows that exist. There is no projection, no
 * benchmark, and no "businesses like yours" — a made-up metric would be worse
 * than an empty state, because the whole proposition on this side of the market
 * is a history a business can point at.
 *
 * Where there is no data yet, the caller gets zeroes and honest copy rather than
 * a fabricated figure.
 */

export interface BusinessValueSummary {
  /** Requests that reached one of this business's services. */
  requestsReceived: number;
  /** Requests answered with a price. */
  quotesSent: number;
  /** Requests turned down. */
  requestsDeclined: number;
  /** Quotes the customer agreed to. */
  jobsAgreed: number;
  /** Agreed jobs where the customer confirmed they collected the work. */
  jobsCompleted: number;
  /** Median minutes from request to first quote. Null until there is one. */
  medianResponseMinutes: number | null;
  /** Quotes sent ÷ requests received, as a percentage. Null when nothing arrived. */
  responseRate: number | null;
  /** Jobs agreed ÷ quotes sent, as a percentage. Null until a quote is sent. */
  winRate: number | null;
  /** True once anything at all has happened. */
  hasActivity: boolean;
}

const EMPTY: BusinessValueSummary = {
  requestsReceived: 0,
  quotesSent: 0,
  requestsDeclined: 0,
  jobsAgreed: 0,
  jobsCompleted: 0,
  medianResponseMinutes: null,
  responseRate: null,
  winRate: null,
  hasActivity: false,
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

function percentage(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

export async function getBusinessValueSummary(
  db: Database,
  businessId: string,
): Promise<BusinessValueSummary> {
  const routes = await db
    .select({ id: quoteRoutes.id })
    .from(quoteRoutes)
    .where(eq(quoteRoutes.businessId, businessId));
  const routeIds = routes.map((r) => r.id);
  if (routeIds.length === 0) return EMPTY;

  const taskRows = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      submittedAt: tasks.submittedAt,
      quotedAt: tasks.quotedAt,
      buyerDecision: tasks.buyerDecision,
      handoffConfirmedAt: tasks.handoffConfirmedAt,
    })
    .from(tasks)
    .where(inArray(tasks.routeId, routeIds));

  if (taskRows.length === 0) return EMPTY;

  const taskIds = taskRows.map((t) => t.id);
  const quoteRows = await db
    .select({ taskId: quotes.taskId, status: quotes.status, revision: quotes.revision })
    .from(quotes)
    .where(inArray(quotes.taskId, taskIds));

  // A request counts as quoted if the business ever sent a price for it —
  // including one it later replaced.
  const quotedTaskIds = new Set(
    quoteRows.filter((q) => q.status !== "DECLINED").map((q) => q.taskId),
  );
  const declinedTaskIds = new Set(
    quoteRows.filter((q) => q.status === "DECLINED").map((q) => q.taskId),
  );

  const pickedUp = await db
    .select({ taskId: prooflineEvents.taskId })
    .from(prooflineEvents)
    .where(
      and(
        inArray(prooflineEvents.taskId, taskIds),
        eq(prooflineEvents.eventType, "PICKUP_CONFIRMED"),
      ),
    );
  const collectedTaskIds = new Set(pickedUp.map((e) => e.taskId));

  const responseMinutes: number[] = [];
  for (const task of taskRows) {
    if (task.submittedAt && task.quotedAt) {
      const minutes = (task.quotedAt.getTime() - task.submittedAt.getTime()) / 60_000;
      if (minutes >= 0) responseMinutes.push(minutes);
    }
  }

  const requestsReceived = taskRows.length;
  const quotesSent = quotedTaskIds.size;
  const jobsAgreed = taskRows.filter((t) => t.buyerDecision === "ACCEPTED").length;
  // "Completed" means the customer confirmed the handover — the strongest
  // signal Intra actually holds. A handed-off order alone is not completion.
  const jobsCompleted = taskRows.filter(
    (t) => t.buyerDecision === "ACCEPTED" && collectedTaskIds.has(t.id),
  ).length;

  return {
    requestsReceived,
    quotesSent,
    requestsDeclined: declinedTaskIds.size,
    jobsAgreed,
    jobsCompleted,
    medianResponseMinutes: median(responseMinutes),
    responseRate: percentage(quotesSent, requestsReceived),
    winRate: percentage(jobsAgreed, quotesSent),
    hasActivity: requestsReceived > 0,
  };
}

/**
 * The one line to put at the top of the business's own overview.
 *
 * Written to be true at every stage, including "nothing has happened yet", and
 * to never promise customers the system cannot promise (§8: no unverified
 * claims such as "you will get more customers").
 */
export function valueHeadline(summary: BusinessValueSummary): string {
  if (!summary.hasActivity) {
    return "Nothing has come in yet. When a customer asks for what you offer, their request lands here.";
  }
  if (summary.jobsCompleted === 1) {
    return "Your first job is complete. Completed jobs build the history customers and their agents can see.";
  }
  if (summary.jobsCompleted > 1) {
    return `${summary.jobsCompleted} jobs completed through Intra. Each one adds to the history attached to your business.`;
  }
  if (summary.jobsAgreed > 0) {
    return `${summary.jobsAgreed} ${summary.jobsAgreed === 1 ? "customer has" : "customers have"} agreed your price. Confirm the handover once they collect.`;
  }
  if (summary.quotesSent > 0) {
    return `You have answered ${summary.quotesSent} ${summary.quotesSent === 1 ? "request" : "requests"} with a price. Customers decide next.`;
  }
  return `${summary.requestsReceived} ${summary.requestsReceived === 1 ? "request is" : "requests are"} waiting for your price.`;
}

/** What the business should do next, if anything. */
export function nextActionForBusiness(input: {
  summary: BusinessValueSummary;
  waitingForQuote: number;
  awaitingHandover: number;
}): string | null {
  if (input.waitingForQuote > 0) {
    return `Send a price for ${input.waitingForQuote} ${input.waitingForQuote === 1 ? "request" : "requests"} waiting on you.`;
  }
  if (input.awaitingHandover > 0) {
    return `Mark ${input.awaitingHandover} ${input.awaitingHandover === 1 ? "order" : "orders"} ready once the work is done.`;
  }
  if (!input.summary.hasActivity) {
    return "Keep your prices current so your services stay available to customers.";
  }
  return null;
}
