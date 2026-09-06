import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { HttpError, ok } from "@/lib/http/response";
import { buildTransactionTrace } from "@/features/evidence/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator/judge evidence trace for one transaction (M9 §14). Operator-key
 * gated — this is the surface that carries raw ids and on-chain references
 * (schema UIDs, tx hashes, agent ids), which never appear in the buyer or
 * business UI (M9 §27).
 */
export const GET = route(async (request, context) => {
  requireOperator(request);
  const { taskId } = await context.params;
  const db = await getDb();

  const trace = await buildTransactionTrace(db, taskId);
  if (!trace) throw new HttpError(404, "TASK_NOT_FOUND", "No transaction with that id.");
  return ok(trace);
});
