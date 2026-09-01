import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type {
  AuditEventRow,
  FeedbackRow,
  QuoteRow,
  ServicePaymentRow,
  TaskRow,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent, listTaskAuditEvents } from "@/features/audit/repository";
import { flyerPrintingInputSchema } from "@/features/routes/flyer-printing";
import { findRouteByBusinessAndSlug, findRouteById } from "@/features/routes/repository";
import { findBusinessById, findBusinessBySlug } from "@/features/businesses/repository";
import { loadUsableRoute } from "@/features/routes/service";
import { recordServicePaymentIntent } from "@/features/payments/service";
import { quoteEffectiveStatus } from "@/features/quotes/expiry";
import type { NormalizedQuote } from "@/features/quotes/normalize";
import { buildOrderMessage } from "@/features/quotes/order-message";
import { buildRecommendationDetail } from "@/features/quotes/recommendation";
import { updateQuoteStatus, updateRecommendation } from "@/features/quotes/repository";
import type { QuoteStatus } from "@/features/quotes/status";
import { getProoflineView, type ProoflineView } from "@/features/proofline/service";

import { assertTaskTransition } from "./lifecycle";
import {
  findTaskById,
  findTaskRecommendation,
  listTaskFeedback,
  listTaskPayments,
  listTaskQuotes,
  insertTask,
  updateTask,
} from "./repository";

const routeRefSchema = z
  .object({
    routeId: z.string().min(1).optional(),
    businessSlug: z.string().min(1).optional(),
    routeSlug: z.string().min(1).optional(),
  })
  .optional();

/** `POST /api/tasks` payload (FR-TASK-001). */
export const createTaskRequestSchema = z.object({
  freeText: z.string().trim().max(2000).optional(),
  structuredInput: z.record(z.string(), z.unknown()).optional(),
  buyerWalletOptIn: z.boolean().optional(),
  route: routeRefSchema,
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

async function resolveRouteId(
  db: Database,
  ref: NonNullable<CreateTaskRequest["route"]>,
): Promise<string> {
  if (ref.routeId) {
    const route = await loadUsableRoute(db, ref.routeId);
    return route.id;
  }
  if (ref.businessSlug && ref.routeSlug) {
    const business = await findBusinessBySlug(db, ref.businessSlug);
    if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");
    const route = await findRouteByBusinessAndSlug(db, business.id, ref.routeSlug);
    if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that slug.");
    // Re-check usability (AC-ROUTE-002: a PAUSED route is not offered).
    return (await loadUsableRoute(db, route.id)).id;
  }
  throw new HttpError(
    400,
    "ROUTE_REF_INVALID",
    "Provide route.routeId or route.businessSlug + route.routeSlug.",
  );
}

export async function createTask(
  db: Database,
  sessionId: string,
  input: CreateTaskRequest,
): Promise<TaskRow> {
  const routeId = input.route ? await resolveRouteId(db, input.route) : null;

  const task = await insertTask(db, {
    sessionId,
    buyerWalletOptIn: input.buyerWalletOptIn ?? false,
    routeId,
    freeText: input.freeText ?? null,
    structuredInput: input.structuredInput ?? null,
    status: "DRAFT",
  });

  await appendAuditEvent(db, {
    type: "task.created",
    taskId: task.id,
    routeId,
    data: { hasStructuredInput: input.structuredInput != null, routeBound: routeId != null },
  });

  return task;
}

function assertSession(task: TaskRow, sessionId: string): void {
  if (task.sessionId !== sessionId) {
    throw new HttpError(403, "FORBIDDEN", "This task belongs to a different session.");
  }
}

export async function submitTask(
  db: Database,
  taskId: string,
  sessionId: string,
): Promise<TaskRow> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  assertSession(task, sessionId);

  assertTaskTransition(task.status, "SUBMITTED");

  // FR-TASK-002 / AC-TASK-002: complete structured brief required.
  const parsed = flyerPrintingInputSchema.safeParse(task.structuredInput ?? {});
  if (!parsed.success) {
    throw new HttpError(
      422,
      "INCOMPLETE_BRIEF",
      "The flyer brief is missing required fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  if (!task.routeId) {
    throw new HttpError(
      409,
      "ROUTE_REQUIRED",
      "Bind an ACTIVE route to the task before submitting.",
    );
  }

  // A route can be paused between task creation and submission (AC-ROUTE-002).
  let route;
  try {
    route = await loadUsableRoute(db, task.routeId);
  } catch (error) {
    await updateTask(db, task.id, { status: "FAILED", failureReason: "ROUTE_UNAVAILABLE" });
    await appendAuditEvent(db, {
      type: "task.failed",
      taskId: task.id,
      routeId: task.routeId,
      data: { reason: "ROUTE_UNAVAILABLE" },
    });
    throw error;
  }

  await updateTask(db, task.id, { status: "SUBMITTED", submittedAt: new Date() });
  await appendAuditEvent(db, { type: "task.submitted", taskId: task.id, routeId: route.id });

  const awaiting = await updateTask(db, task.id, { status: "AWAITING_QUOTE" });
  await appendAuditEvent(db, { type: "task.awaiting_quote", taskId: task.id, routeId: route.id });

  // Honest payment state — UNAVAILABLE until real x402 access (FR-PAY-004).
  await recordServicePaymentIntent(db, awaiting, route);

  return awaiting;
}

/**
 * Supplier detail the buyer is allowed to see (no secrets).
 *
 * `name` / `city` / `country` appear once a real quote exists (`RECOMMENDED`) so
 * the buyer knows who they are choosing. The order **contact channel** is only
 * filled once the buyer has accepted (`HANDOFF_READY`) — least data necessary.
 */
export interface TaskSupplier {
  name: string;
  city: string;
  country: string;
  contactChannelType: string | null;
  contactChannelValue: string | null;
}
export interface TaskRouteInfo {
  slug: string;
  name: string;
  status: string;
  responseSlaMinutes: number;
  priceUpdatedAt: Date | null;
  verifiedAt: Date | null;
}

export type TaskQuoteView = QuoteRow & { effectiveStatus: QuoteStatus };

export interface TaskRecommendationView {
  rationale: string;
  orderMessage: string;
  reasoning: string[];
  uncertainties: string[];
  verificationNote: string;
  normalized: NormalizedQuote;
  quoteExpired: boolean;
}

export interface TaskView {
  task: TaskRow;
  route: TaskRouteInfo | null;
  supplier: TaskSupplier | null;
  quotes: TaskQuoteView[];
  payments: ServicePaymentRow[];
  recommendation: TaskRecommendationView | null;
  feedback: FeedbackRow[];
  timeline: AuditEventRow[];
  /** ISO time the buyer confirmed they sent the handoff message, or null. */
  handoffConfirmedAt: string | null;
  /**
   * Proofline pilot fulfilment evidence — present only once the buyer has
   * handed off the order. Never carries the merchant's pickup code.
   */
  proofline: ProoflineView | null;
}

const HANDOFF_CONFIRMED_EVENT = "task.handoff_confirmed";

/** `POST /api/tasks/:id/decision` payload. */
export const decideOnQuoteRequestSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().max(500).optional(),
});
export type DecideOnQuoteRequest = z.infer<typeof decideOnQuoteRequestSchema>;

export interface QuoteDecisionResult {
  task: TaskRow;
  decision: "ACCEPTED" | "DECLINED";
  quoteExpired: boolean;
}

/**
 * The buyer's explicit choice on a real quote (PRD §8, FR-REC-004). This is a
 * distinct, separately timestamped step:
 *
 *   RECOMMENDED --accept--> HANDOFF_READY   (Intra now reveals the WhatsApp message)
 *   RECOMMENDED --decline-> CANCELLED       (with an optional reason)
 *
 * Accepting an expired quote is allowed — the buyer stays in control — but the
 * quote is marked EXPIRED and the message tells the printer to reconfirm.
 * Intra still never sends the message or places the order.
 */
export async function decideOnQuote(
  db: Database,
  taskId: string,
  sessionId: string,
  input: DecideOnQuoteRequest,
): Promise<QuoteDecisionResult> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  assertSession(task, sessionId);

  if (task.status !== "RECOMMENDED") {
    throw new HttpError(
      409,
      "TASK_NOT_AWAITING_DECISION",
      `Task is ${task.status}. A quote must be waiting for your decision (RECOMMENDED).`,
    );
  }

  const now = new Date();

  if (input.decision === "DECLINE") {
    assertTaskTransition("RECOMMENDED", "CANCELLED");
    const cancelled = await updateTask(db, task.id, {
      status: "CANCELLED",
      buyerDecision: "DECLINED",
      buyerDecidedAt: now,
      buyerDeclineReason: input.reason ?? null,
      closedAt: now,
    });
    await appendAuditEvent(db, {
      type: "task.buyer_declined",
      taskId: task.id,
      routeId: task.routeId,
      data: { hasReason: input.reason != null },
    });
    return { task: cancelled, decision: "DECLINED", quoteExpired: false };
  }

  const [quote] = await listTaskQuotes(db, task.id);
  const recommendation = await findTaskRecommendation(db, task.id);
  if (!quote || quote.status === "DECLINED" || !recommendation) {
    throw new HttpError(409, "NO_QUOTE_TO_ACCEPT", "There is no quote to accept on this task.");
  }

  const expired = quoteEffectiveStatus(quote, now) === "EXPIRED";
  if (expired && quote.status !== "EXPIRED") {
    await updateQuoteStatus(db, quote.id, "EXPIRED");
    await appendAuditEvent(db, {
      type: "quote.expired",
      taskId: task.id,
      routeId: task.routeId,
      quoteId: quote.id,
      data: {},
    });
  }

  // Finalise the WhatsApp message now the buyer has chosen (adds the expiry
  // caveat when needed). Generated only — never sent (FR-REC-002).
  if (task.routeId) {
    const routeRow = await findRouteById(db, task.routeId);
    const businessRow = routeRow ? await findBusinessById(db, routeRow.businessId) : null;
    if (businessRow) {
      await updateRecommendation(db, recommendation.id, {
        orderMessage: buildOrderMessage(businessRow, task, quote, { expired }),
      });
    }
  }

  assertTaskTransition("RECOMMENDED", "HANDOFF_READY");
  const handoffReady = await updateTask(db, task.id, {
    status: "HANDOFF_READY",
    buyerDecision: "ACCEPTED",
    buyerDecidedAt: now,
    closedAt: now,
  });
  await appendAuditEvent(db, {
    type: "task.buyer_accepted",
    taskId: task.id,
    quoteId: quote.id,
    data: { quoteExpired: expired },
  });
  await appendAuditEvent(db, {
    type: "task.handoff_ready",
    taskId: task.id,
    quoteId: quote.id,
    data: { note: "Order message generated. Never auto-sent (FR-REC-002)." },
  });

  return { task: handoffReady, decision: "ACCEPTED", quoteExpired: expired };
}

/**
 * The buyer confirms they have sent the pre-filled message to the printer.
 * This is an explicit user action — Intra cannot observe WhatsApp — and it is
 * what unlocks the post-handoff feedback form. Idempotent: a second call is a
 * no-op. No task status change (HANDOFF_READY stays terminal).
 */
export async function confirmHandoff(
  db: Database,
  taskId: string,
  sessionId: string,
): Promise<{ handoffConfirmedAt: string }> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  assertSession(task, sessionId);

  if (task.status !== "HANDOFF_READY") {
    throw new HttpError(
      409,
      "HANDOFF_NOT_READY",
      "There is nothing to hand off yet — accept a quote first.",
    );
  }

  if (task.handoffConfirmedAt) {
    return { handoffConfirmedAt: task.handoffConfirmedAt.toISOString() };
  }
  const existing = (await listTaskAuditEvents(db, taskId)).find(
    (event) => event.type === HANDOFF_CONFIRMED_EVENT,
  );
  if (existing) return { handoffConfirmedAt: existing.createdAt.toISOString() };

  const event = await appendAuditEvent(db, {
    type: HANDOFF_CONFIRMED_EVENT,
    taskId: task.id,
    routeId: task.routeId,
    data: {},
  });
  await updateTask(db, task.id, { handoffConfirmedAt: event.createdAt });
  return { handoffConfirmedAt: event.createdAt.toISOString() };
}

export async function getTaskView(
  db: Database,
  taskId: string,
  sessionId: string,
): Promise<TaskView> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  assertSession(task, sessionId);

  const now = new Date();
  const [quoteRows, payments, recommendationRow, feedback, timeline] = await Promise.all([
    listTaskQuotes(db, taskId),
    listTaskPayments(db, taskId),
    findTaskRecommendation(db, taskId),
    listTaskFeedback(db, taskId),
    listTaskAuditEvents(db, taskId),
  ]);

  const quotes: TaskQuoteView[] = quoteRows.map((quote) => ({
    ...quote,
    effectiveStatus: quoteEffectiveStatus(quote, now),
  }));
  const primaryQuote = quoteRows[0] ?? null;
  const contactRevealed = task.status === "HANDOFF_READY";

  let route: TaskRouteInfo | null = null;
  let supplier: TaskSupplier | null = null;
  let recommendation: TaskRecommendationView | null = null;

  if (task.routeId) {
    const routeRow = await findRouteById(db, task.routeId);
    if (routeRow) {
      route = {
        slug: routeRow.slug,
        name: routeRow.name,
        status: routeRow.status,
        responseSlaMinutes: routeRow.responseSlaMinutes,
        priceUpdatedAt: routeRow.priceUpdatedAt,
        verifiedAt: routeRow.verifiedAt,
      };

      if (recommendationRow) {
        const businessRow = await findBusinessById(db, routeRow.businessId);
        if (businessRow) {
          supplier = {
            name: businessRow.name,
            city: businessRow.city,
            country: businessRow.country,
            contactChannelType: contactRevealed ? businessRow.contactChannelType : null,
            contactChannelValue: contactRevealed ? businessRow.contactChannelValue : null,
          };
          if (primaryQuote && primaryQuote.status !== "DECLINED") {
            const detail = buildRecommendationDetail({
              quote: primaryQuote,
              route: routeRow,
              business: businessRow,
              brief: task.structuredInput,
              now,
            });
            recommendation = {
              rationale: recommendationRow.rationale,
              orderMessage: recommendationRow.orderMessage,
              reasoning: detail.reasoning,
              uncertainties: detail.uncertainties,
              verificationNote: detail.verificationNote,
              normalized: detail.normalized,
              quoteExpired: detail.quoteExpired,
            };
          }
        }
      }
    }
  }

  const handoffConfirmedAt =
    task.handoffConfirmedAt?.toISOString() ??
    timeline.find((event) => event.type === HANDOFF_CONFIRMED_EVENT)?.createdAt.toISOString() ??
    null;

  // Proofline is only offered after a genuine buyer handoff (ADR-016).
  const proofline = handoffConfirmedAt
    ? await getProoflineView(db, taskId, { includePickupCode: false })
    : null;

  return {
    task,
    route,
    supplier,
    quotes,
    payments,
    recommendation,
    feedback,
    timeline,
    handoffConfirmedAt,
    proofline,
  };
}
