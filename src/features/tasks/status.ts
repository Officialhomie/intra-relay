import { z } from "zod";

/** Task lifecycle (PRD §7). */
export const TASK_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "AWAITING_QUOTE",
  "RECOMMENDED",
  "HANDOFF_READY",
  "FAILED",
  "CANCELLED",
] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
