import type { TaskRow } from "@/lib/db/schema";

/**
 * Whether a session is authorised to act on a task (milestone 6 §17).
 *
 * A task carries the session that created it (`sessionId`) and, when an agent
 * created it on a human's behalf, the human's browser session
 * (`buyerClaimSession`). Either is a valid owner.
 *
 * The claim is stamped once, at task creation, by whoever creates the task, and
 * is never mutated afterwards. You can therefore only ever claim a task you are
 * creating — never seize one that already exists — so this stays
 * server-authoritative and unforgeable even though the value originates from a
 * request body.
 */
export function taskBelongsToSession(
  task: Pick<TaskRow, "sessionId" | "buyerClaimSession">,
  sessionId: string,
): boolean {
  return task.sessionId === sessionId || task.buyerClaimSession === sessionId;
}
