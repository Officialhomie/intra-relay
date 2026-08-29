import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { FeedbackRow } from "@/lib/db/schema";
import { feedback } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { findTaskById } from "@/features/tasks/repository";

/** `POST /api/feedback` payload. */
export const createFeedbackRequestSchema = z.object({
  taskId: z.string().min(1),
  useful: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});
export type CreateFeedbackRequest = z.infer<typeof createFeedbackRequestSchema>;

export async function createFeedback(
  db: Database,
  input: CreateFeedbackRequest,
): Promise<FeedbackRow> {
  const task = await findTaskById(db, input.taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No task with that id.");

  const [row] = await db
    .insert(feedback)
    .values({ taskId: task.id, useful: input.useful, comment: input.comment ?? null })
    .returning();

  await appendAuditEvent(db, {
    type: "feedback.received",
    taskId: task.id,
    data: { useful: row.useful },
  });

  return row;
}
