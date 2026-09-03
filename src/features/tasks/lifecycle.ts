import { HttpError } from "@/lib/http/response";

import type { TaskStatus } from "./status";

/**
 * Task lifecycle (PRD §7).
 *
 *   DRAFT ─▶ SUBMITTED ─▶ AWAITING_QUOTE ─▶ RECOMMENDED ─▶ HANDOFF_READY
 *   any active state ─▶ FAILED | CANCELLED
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["AWAITING_QUOTE", "FAILED", "CANCELLED"],
  AWAITING_QUOTE: ["RECOMMENDED", "FAILED", "CANCELLED"],
  RECOMMENDED: ["HANDOFF_READY", "FAILED", "CANCELLED"],
  // An agreed order can still fall through: the provider withdraws or cannot
  // fulfil, or the handover fails (milestone 6 §18).
  HANDOFF_READY: ["CANCELLED", "FAILED"],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new HttpError(
      409,
      "INVALID_TASK_TRANSITION",
      `A task cannot move from ${from} to ${to}.`,
    );
  }
}

export const TASK_TERMINAL: readonly TaskStatus[] = ["HANDOFF_READY", "FAILED", "CANCELLED"];

export function isTaskTerminal(status: TaskStatus): boolean {
  return TASK_TERMINAL.includes(status);
}
