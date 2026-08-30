import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type {
  AuditEventRow,
  FeedbackRow,
  QuoteRow,
  RecommendationRow,
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

/** Supplier contact + route freshness the buyer is allowed to see (no secrets). */
export interface TaskSupplier {
  name: string;
  contactChannelType: string;
  contactChannelValue: string;
  city: string;
  country: string;
}
export interface TaskRouteInfo {
  slug: string;
  name: string;
  status: string;
  responseSlaMinutes: number;
  priceUpdatedAt: Date | null;
  verifiedAt: Date | null;
}

export interface TaskView {
  task: TaskRow;
  route: TaskRouteInfo | null;
  supplier: TaskSupplier | null;
  quotes: QuoteRow[];
  payments: ServicePaymentRow[];
  recommendation: RecommendationRow | null;
  feedback: FeedbackRow[];
  timeline: AuditEventRow[];
  /** ISO time the buyer confirmed they sent the handoff message, or null. */
  handoffConfirmedAt: string | null;
}

const HANDOFF_CONFIRMED_EVENT = "task.handoff_confirmed";

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
      "There is nothing to hand off yet — wait for the recommendation.",
    );
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

  const [quotes, payments, recommendation, feedback, timeline] = await Promise.all([
    listTaskQuotes(db, taskId),
    listTaskPayments(db, taskId),
    findTaskRecommendation(db, taskId),
    listTaskFeedback(db, taskId),
    listTaskAuditEvents(db, taskId),
  ]);

  let route: TaskRouteInfo | null = null;
  let supplier: TaskSupplier | null = null;
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
      // Supplier contact is only revealed once there is a recommendation to act on.
      if (recommendation) {
        const businessRow = await findBusinessById(db, routeRow.businessId);
        if (businessRow) {
          supplier = {
            name: businessRow.name,
            contactChannelType: businessRow.contactChannelType,
            contactChannelValue: businessRow.contactChannelValue,
            city: businessRow.city,
            country: businessRow.country,
          };
        }
      }
    }
  }

  const handoffConfirmedAt =
    timeline.find((event) => event.type === HANDOFF_CONFIRMED_EVENT)?.createdAt.toISOString() ??
    null;

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
  };
}
