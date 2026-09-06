import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireSessionId } from "@/lib/http/request";
import { HttpError, ok } from "@/lib/http/response";
import { findCommitmentByTaskId } from "@/features/commitments/repository";
import { attestCommitment, toPublicCommitment } from "@/features/commitments/service";
import { findTaskById } from "@/features/tasks/repository";
import { taskBelongsToSession } from "@/features/tasks/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwnedCommitment(taskId: string, sessionId: string) {
  const db = await getDb();
  const task = await findTaskById(db, taskId);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "No order with that id.");
  if (!taskBelongsToSession(task, sessionId)) {
    throw new HttpError(403, "NOT_YOUR_TASK", "This order belongs to a different session.");
  }
  return { db, task };
}

/** Read the commitment. Never exposes the salt or the buyer's handover code. */
export const GET = route(async (request, context) => {
  const { id } = await context.params;
  const sessionId = requireSessionId(request, new URL(request.url));
  const { db } = await loadOwnedCommitment(id, sessionId);

  const row = await findCommitmentByTaskId(db, id);
  if (!row) {
    throw new HttpError(
      404,
      "NO_COMMITMENT",
      "This order has no commitment. One is created when a buyer approves a quote.",
    );
  }
  return ok(toPublicCommitment(row));
});

/**
 * Write the commitment attestation. Idempotent — a second call returns the
 * stored UID rather than attesting again. Never reports ATTESTED unless the
 * writer actually returned a result, and a mock result is always labelled.
 */
export const POST = route(async (request, context) => {
  const { id } = await context.params;
  const sessionId = requireSessionId(request, new URL(request.url));
  const { db } = await loadOwnedCommitment(id, sessionId);

  const existing = await findCommitmentByTaskId(db, id);
  if (!existing) {
    throw new HttpError(
      409,
      "NO_COMMITMENT",
      "There is no approved commitment on this order to attest.",
    );
  }

  const result = await attestCommitment(db, id);
  return ok({
    ...toPublicCommitment(result.commitment),
    wrote: result.wrote,
    mode: result.mode,
  });
});
