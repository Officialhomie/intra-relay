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
    turnaround: z.string().trim().min(1).max(120),
    assumptions: z.string().trim().max(500).optional(),
    confidence: quoteConfidenceSchema.optional(),
    fixed: z.boolean().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((value) => value.amountMax === undefined || value.amountMax >= value.amountMin, {
    message: "amountMax must be greater than or equal to amountMin.",
    path: ["amountMax"],
  });
export type SubmitQuoteRequest = z.infer<typeof submitQuoteRequestSchema>;

export interface QuoteResult {
  quote: QuoteRow;
  recommendation: RecommendationRow;
  task: TaskRow;
}

export async function submitQuote(
  db: Database,
  routeId: string,
  input: SubmitQuoteRequest,
): Promise<QuoteResult> {
  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");

  // AC-ROUTE-002: a PAUSED (or otherwise non-ACTIVE) route accepts no quote and
  // triggers no payment request.
  if (route.status !== "ACTIVE") {
    throw new HttpError(409, "ROUTE_UNAVAILABLE", `This route is ${route.status}.`);
  }

  const task = await findTaskById(db, input.taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");
  if (task.routeId && task.routeId !== routeId) {
    throw new HttpError(409, "TASK_ROUTE_MISMATCH", "This task is bound to a different route.");
  }

  const existing = await findRecommendationByTask(db, task.id);
  if (existing) {
    throw new HttpError(409, "QUOTE_EXISTS", "This task already has a quote and recommendation.");
  }

  if (task.status !== "AWAITING_QUOTE") {
    throw new HttpError(
      409,
      "TASK_NOT_AWAITING_QUOTE",
      `Task is ${task.status}, not AWAITING_QUOTE.`,
    );
  }

  const business = await findBusinessById(db, route.businessId);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Route has no business.");

  const quote = await insertQuote(db, {
    taskId: task.id,
    routeId: route.id,
    amountMin: input.amountMin.toFixed(2),
    amountMax: input.amountMax?.toFixed(2) ?? null,
    currency: route.quoteCurrency,
    turnaround: input.turnaround,
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
