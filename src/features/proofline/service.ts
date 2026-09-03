import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { TaskRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { notify } from "@/features/notifications/service";
import { manageTokenMatchesTask } from "@/features/businesses/access";
import { findTaskById } from "@/features/tasks/repository";
import { taskBelongsToSession } from "@/features/tasks/ownership";

import { generatePickupCode, pickupCodeMatches } from "./code";
import { insertProoflineEvent, listProoflineEvents } from "./repository";
import type { ProoflineConfirmationMethod } from "./status";
import { buildProoflineView, type ProoflineView } from "./view";

export { buildProoflineView };
export type { ProoflineEventView, ProoflineView } from "./view";

/** Read-only Proofline state for a task. `includePickupCode` only for the merchant. */
export async function getProoflineView(
  db: Database,
  taskId: string,
  options: { includePickupCode: boolean },
): Promise<ProoflineView> {
  return buildProoflineView(await listProoflineEvents(db, taskId), options);
}

function assertPastHandoff(task: TaskRow): void {
  if (!task.handoffConfirmedAt) {
    throw new HttpError(
      409,
      "HANDOFF_NOT_CONFIRMED",
      "A fulfilment event can only be recorded after the buyer has personally handed off the order.",
    );
  }
}

export interface MarkReadyResult {
  view: ProoflineView;
  /** Returned once, to the authenticated merchant, so they can read it to the buyer. */
  pickupCode: string;
}

/**
 * Merchant records that the job is ready for pickup (Proofline event 1).
 * Requires the route's manage token and a buyer handoff already on record.
 */
export async function markReadyForPickup(
  db: Database,
  taskId: string,
  actor: { manageToken: string | null },
): Promise<MarkReadyResult> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");

  if (!(await manageTokenMatchesTask(db, taskId, actor.manageToken))) {
    throw new HttpError(
      401,
      "PROOFLINE_MERCHANT_AUTH_REQUIRED",
      "Marking an order ready needs the printer's manage token.",
    );
  }

  assertPastHandoff(task);

  const events = await listProoflineEvents(db, taskId);
  if (events.some((event) => event.eventType === "READY_FOR_PICKUP")) {
    throw new HttpError(
      409,
      "ALREADY_MARKED_READY",
      "This order is already marked ready for pickup.",
    );
  }

  const pickupCode = generatePickupCode();
  await insertProoflineEvent(db, {
    taskId,
    eventType: "READY_FOR_PICKUP",
    actorRole: "merchant",
    confirmationMethod: "merchant_manage_token",
    evidenceStatus: "MERCHANT_MARKED_READY",
    pickupCode,
  });
  await appendAuditEvent(db, {
    type: "proofline.ready_for_pickup",
    taskId,
    routeId: task.routeId,
    data: {},
  });
  await notify(db, { event: "proofline.ready_for_pickup", taskId });

  const view = buildProoflineView(await listProoflineEvents(db, taskId), {
    includePickupCode: true,
  });
  return { view, pickupCode };
}

export const confirmPickupRequestSchema = z.object({
  code: z.string().trim().min(1).max(24).optional(),
});
export type ConfirmPickupRequest = z.infer<typeof confirmPickupRequestSchema>;

export interface ConfirmPickupResult {
  view: ProoflineView;
  method: ProoflineConfirmationMethod;
}

/**
 * Buyer confirms they collected the order (Proofline event 2). Accepted either
 * from the buyer's own task session ("signed-in") or by entering the one-time
 * pickup code the merchant handed them. Cannot run before event 1.
 */
export async function confirmPickup(
  db: Database,
  taskId: string,
  input: { sessionId: string | null; code?: string },
): Promise<ConfirmPickupResult> {
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");

  const events = await listProoflineEvents(db, taskId);
  const ready = events.find((event) => event.eventType === "READY_FOR_PICKUP") ?? null;
  if (!ready) {
    throw new HttpError(
      409,
      "NOT_READY_FOR_PICKUP",
      "The printer has not marked this order ready for pickup yet.",
    );
  }
  if (events.some((event) => event.eventType === "PICKUP_CONFIRMED")) {
    throw new HttpError(
      409,
      "PICKUP_ALREADY_CONFIRMED",
      "Pickup for this order is already confirmed.",
    );
  }

  let method: ProoflineConfirmationMethod | null = null;
  if (input.sessionId && taskBelongsToSession(task, input.sessionId)) {
    method = "buyer_session";
  } else if (input.code && ready.pickupCode && pickupCodeMatches(input.code, ready.pickupCode)) {
    method = "one_time_code";
  }
  if (!method) {
    throw new HttpError(
      401,
      "PICKUP_CONFIRM_REJECTED",
      "Confirm from your own request link, or enter the pickup code the printer gave you.",
    );
  }

  await insertProoflineEvent(db, {
    taskId,
    eventType: "PICKUP_CONFIRMED",
    actorRole: "buyer",
    confirmationMethod: method,
    evidenceStatus: "BUYER_CONFIRMED_PICKUP",
  });
  await appendAuditEvent(db, {
    type: "proofline.pickup_confirmed",
    taskId,
    routeId: task.routeId,
    data: { method },
  });
  await notify(db, { event: "proofline.pickup_confirmed", taskId });

  const view = buildProoflineView(await listProoflineEvents(db, taskId), {
    includePickupCode: false,
  });
  return { view, method };
}
