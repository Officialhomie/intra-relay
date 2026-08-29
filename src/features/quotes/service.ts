import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { QuoteRow, RecommendationRow, TaskRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { findBusinessById } from "@/features/businesses/repository";
import { findRouteById } from "@/features/routes/repository";
import { assertTaskTransition } from "@/features/tasks/lifecycle";
import { findTaskById, updateTask } from "@/features/tasks/repository";

import { buildOrderMessage, buildRationale } from "./order-message";
import { findRecommendationByTask, insertQuote, insertRecommendation } from "./repository";
import { quoteConfidenceSchema } from "./status";

/** `POST /api/routes/:id/quotes` payload (FR-REC-001). */
export const submitQuoteRequestSchema = z
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
  })
  .refine((value) => value.amountMax === undefined || value.amountMax >= value.amountMin, {
    message: "The maximum must be greater than or equal to the minimum.",
    path: ["amountMax"],
  });
export type SubmitQuoteRequest = z.infer<typeof submitQuoteRequestSchema>;

/** `POST /api/routes/:id/quotes` with `decline: true`. */
export const declineRequestSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
});
export type DeclineRequest = z.infer<typeof declineRequestSchema>;

export interface QuoteResult {
  quote: QuoteRow;
  recommendation: RecommendationRow;
  task: TaskRow;
}

async function loadAwaitingTask(db: Database, routeId: string, taskId: string) {
  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");
  // AC-ROUTE-002: a PAUSED / non-ACTIVE route accepts nothing and triggers no 402.
  if (route.status !== "ACTIVE") {
    throw new HttpError(409, "ROUTE_UNAVAILABLE", `This route is ${route.status}.`);
  }

  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  if (task.routeId && task.routeId !== routeId) {
    throw new HttpError(409, "TASK_ROUTE_MISMATCH", "This task is bound to a different route.");
  }
  if (await findRecommendationByTask(db, task.id)) {
    throw new HttpError(409, "QUOTE_EXISTS", "This task already has a response.");
  }
  if (task.status !== "AWAITING_QUOTE") {
    throw new HttpError(
      409,
      "TASK_NOT_AWAITING_QUOTE",
      `Task is ${task.status}, not AWAITING_QUOTE.`,
    );
  }
  return { route, task };
}

export async function submitQuote(
  db: Database,
  routeId: string,
  input: SubmitQuoteRequest,
): Promise<QuoteResult> {
  const { route, task } = await loadAwaitingTask(db, routeId, input.taskId);

  const business = await findBusinessById(db, route.businessId);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Route has no business.");

  const quote = await insertQuote(db, {
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
    status: "RECEIVED",
  });
  await appendAuditEvent(db, {
    type: "quote.received",
    taskId: task.id,
    routeId: route.id,
    quoteId: quote.id,
    data: { amountMin: quote.amountMin, amountMax: quote.amountMax, currency: quote.currency },
  });

  const recommendation = await insertRecommendation(db, {
    taskId: task.id,
    quoteId: quote.id,
    rationale: buildRationale(quote),
    confidence: quote.confidence,
    orderMessage: buildOrderMessage(business, task, quote),
  });

  assertTaskTransition(task.status, "RECOMMENDED");
  await updateTask(db, task.id, { status: "RECOMMENDED" });
  await appendAuditEvent(db, {
    type: "recommendation.created",
    taskId: task.id,
    quoteId: quote.id,
  });

  assertTaskTransition("RECOMMENDED", "HANDOFF_READY");
  const handoffReady = await updateTask(db, task.id, { status: "HANDOFF_READY" });
  await appendAuditEvent(db, {
    type: "task.handoff_ready",
    taskId: task.id,
    quoteId: quote.id,
    data: { note: "Order message generated. Never auto-sent (FR-REC-002)." },
  });

  return { quote, recommendation, task: handoffReady };
}

/** Supplier declines out of area / capacity — the task fails safely, no quote. */
export async function declineRequest(
  db: Database,
  routeId: string,
  input: DeclineRequest,
): Promise<{ quote: QuoteRow; task: TaskRow }> {
  const { route, task } = await loadAwaitingTask(db, routeId, input.taskId);

  const quote = await insertQuote(db, {
    taskId: task.id,
    routeId: route.id,
    amountMin: "0.00",
    currency: route.quoteCurrency,
    turnaround: "n/a",
    status: "DECLINED",
    declineReason: input.reason,
  });
  await appendAuditEvent(db, {
    type: "quote.declined",
    taskId: task.id,
    routeId: route.id,
    quoteId: quote.id,
    data: { reason: input.reason },
  });

  assertTaskTransition(task.status, "FAILED");
  const failed = await updateTask(db, task.id, {
    status: "FAILED",
    failureReason: "SUPPLIER_DECLINED",
  });
  await appendAuditEvent(db, {
    type: "task.failed",
    taskId: task.id,
    data: { reason: "SUPPLIER_DECLINED" },
  });

  return { quote, task: failed };
}
