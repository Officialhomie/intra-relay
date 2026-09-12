import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { TaskRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { notify } from "@/features/notifications/service";
import { invalidateOrderPaymentsForTask } from "@/features/payments/order/intent";
import { findRouteById } from "@/features/routes/repository";
import { listTaskQuotes } from "@/features/tasks/repository";
import { updateQuote } from "@/features/quotes/repository";
import { LIVE_QUOTE_STATUSES } from "@/features/quotes/status";

import { assertTaskTransition } from "./lifecycle";
import { taskBelongsToSession } from "./ownership";
import { findTaskById, updateTask } from "./repository";

/**
 * The exception transitions an order can take on the way to (or instead of) a
 * clean handover (milestone 6 §18). Each one:
 *
 *  - moves the task to a terminal state with a *semantic* reason code
 *    (`exceptions.ts` turns it into what-happened / do-you-act / what-next);
 *  - closes any live quote as WITHDRAWN — never edits its terms (§15, §16);
 *  - writes an audit event;
 *  - expires any live MiniPay payment intent (housekeeping — a dead order can't
 *    be paid) but never invents a financial outcome: no refund, no settlement,
 *    no receipt (§4.1). A confirmed on-chain payment is left exactly as it is.
 */

const ACTIVE_BEFORE_AGREEMENT: readonly TaskRow["status"][] = ["AWAITING_QUOTE", "RECOMMENDED"];

async function loadRouteTask(db: Database, routeId: string, taskId: string): Promise<TaskRow> {
  const routeExists = await findRouteById(db, routeId);
  if (!routeExists) throw new HttpError(404, "ROUTE_NOT_FOUND", "No route with that id.");
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (task.routeId && task.routeId !== routeId) {
    throw new HttpError(409, "TASK_ROUTE_MISMATCH", "This order is on a different route.");
  }
  return task;
}

async function withdrawLiveQuotes(db: Database, taskId: string): Promise<void> {
  const quotes = await listTaskQuotes(db, taskId);
  for (const quote of quotes) {
    if ((LIVE_QUOTE_STATUSES as readonly string[]).includes(quote.status)) {
      await updateQuote(db, quote.id, { status: "WITHDRAWN" });
    }
  }
}

export const providerExceptionSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().trim().min(1).max(400),
});
export type ProviderExceptionInput = z.infer<typeof providerExceptionSchema>;

export interface ExceptionOutcome {
  task: TaskRow;
  reason: string;
}

/**
 * The business pulls out. Before the buyer agreed, this just closes the
 * request; after they agreed, it closes an order the business will not honour.
 */
export async function withdrawAsProvider(
  db: Database,
  routeId: string,
  input: ProviderExceptionInput,
): Promise<ExceptionOutcome> {
  const task = await loadRouteTask(db, routeId, input.taskId);
  const now = new Date();

  const beforeAgreement = ACTIVE_BEFORE_AGREEMENT.includes(task.status);
  const afterAgreement = task.status === "HANDOFF_READY";
  if (!beforeAgreement && !afterAgreement) {
    throw new HttpError(409, "ORDER_NOT_WITHDRAWABLE", `This order is ${task.status}.`);
  }

  const reason = beforeAgreement ? "PROVIDER_WITHDREW" : "PROVIDER_WITHDREW_AFTER_AGREEMENT";
  await withdrawLiveQuotes(db, task.id);

  assertTaskTransition(task.status, "FAILED");
  const failed = await updateTask(db, task.id, {
    status: "FAILED",
    failureReason: reason,
    closedAt: now,
  });
  await appendAuditEvent(db, {
    type: "task.failed",
    taskId: task.id,
    routeId,
    data: { reason, note: input.reason },
  });
  await notify(db, { event: "task.failed", taskId: task.id });
  await invalidateOrderPaymentsForTask(db, task.id);
  return { task: failed, reason };
}

/** The business agreed the job and now cannot complete it. */
export async function providerCannotFulfil(
  db: Database,
  routeId: string,
  input: ProviderExceptionInput,
): Promise<ExceptionOutcome> {
  const task = await loadRouteTask(db, routeId, input.taskId);
  if (task.status !== "HANDOFF_READY") {
    throw new HttpError(
      409,
      "ORDER_NOT_AGREED",
      "Only an agreed order can be reported as unfulfillable.",
    );
  }
  const now = new Date();
  assertTaskTransition(task.status, "FAILED");
  const failed = await updateTask(db, task.id, {
    status: "FAILED",
    failureReason: "PROVIDER_CANNOT_FULFILL",
    closedAt: now,
  });
  await appendAuditEvent(db, {
    type: "task.failed",
    taskId: task.id,
    routeId,
    data: { reason: "PROVIDER_CANNOT_FULFILL", note: input.reason },
  });
  await notify(db, { event: "task.failed", taskId: task.id });
  await invalidateOrderPaymentsForTask(db, task.id);
  return { task: failed, reason: "PROVIDER_CANNOT_FULFILL" };
}

export const buyerCancelSchema = z.object({
  reason: z.string().trim().max(400).optional(),
});
export type BuyerCancelInput = z.infer<typeof buyerCancelSchema>;

/**
 * The buyer cancels an order they had already agreed. Distinct from declining a
 * recommendation (that is `decideOnQuote` → CANCELLED before agreement).
 */
export async function buyerCancelsAfterAgreement(
  db: Database,
  taskId: string,
  sessionId: string,
  input: BuyerCancelInput,
): Promise<ExceptionOutcome> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "FORBIDDEN", "This order belongs to a different session.");
  }
  if (task.status !== "HANDOFF_READY") {
    throw new HttpError(
      409,
      "ORDER_NOT_CANCELLABLE_HERE",
      task.status === "RECOMMENDED"
        ? "Decline the recommendation instead — you have not agreed this order yet."
        : `This order is ${task.status}.`,
    );
  }
  const now = new Date();
  assertTaskTransition(task.status, "CANCELLED");
  const cancelled = await updateTask(db, task.id, {
    status: "CANCELLED",
    failureReason: "BUYER_CANCELLED_AFTER_AGREEMENT",
    buyerDeclineReason: input.reason ?? null,
    closedAt: now,
  });
  await appendAuditEvent(db, {
    type: "task.buyer_declined",
    taskId: task.id,
    routeId: task.routeId,
    data: { reason: "BUYER_CANCELLED_AFTER_AGREEMENT", hasReason: input.reason != null },
  });
  await notify(db, { event: "task.buyer_declined", taskId: task.id });
  await invalidateOrderPaymentsForTask(db, task.id);
  return { task: cancelled, reason: "BUYER_CANCELLED_AFTER_AGREEMENT" };
}

export const handoverProblemSchema = z.object({
  detail: z.string().trim().max(400).optional(),
});
export type HandoverProblemInput = z.infer<typeof handoverProblemSchema>;

/**
 * The pickup / handover did not complete. The order is not marked done and no
 * completion record is written — the two parties re-coordinate directly.
 */
export async function reportHandoverFailure(
  db: Database,
  taskId: string,
  sessionId: string,
  input: HandoverProblemInput,
): Promise<ExceptionOutcome> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "FORBIDDEN", "This order belongs to a different session.");
  }
  if (task.status !== "HANDOFF_READY") {
    throw new HttpError(409, "ORDER_NOT_IN_HANDOVER", `This order is ${task.status}.`);
  }
  const now = new Date();
  assertTaskTransition(task.status, "FAILED");
  const failed = await updateTask(db, task.id, {
    status: "FAILED",
    failureReason: "HANDOVER_FAILED",
    closedAt: now,
  });
  await appendAuditEvent(db, {
    type: "task.failed",
    taskId: task.id,
    routeId: task.routeId,
    data: { reason: "HANDOVER_FAILED", hasDetail: input.detail != null },
  });
  await notify(db, { event: "task.failed", taskId: task.id });
  await invalidateOrderPaymentsForTask(db, task.id);
  return { task: failed, reason: "HANDOVER_FAILED" };
}
