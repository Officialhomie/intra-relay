import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { ok } from "@/lib/http/response";
import { getPilotFunnel } from "@/features/analytics/pilot";
import { buildPilotScorecard } from "@/features/analytics/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pilot funnel + observation scorecard (milestone 7 §33, §40; M9.5 §50) —
 * counted entirely from real audit rows. Operator-gated. Every number is a
 * genuine count; 0 means no data, never an estimate. This is OPERATIONAL truth
 * and works with no analytics key configured.
 */
export const GET = route(async (request) => {
  requireOperator(request);
  const db = await getDb();
  const [funnel, scorecard] = await Promise.all([getPilotFunnel(db), buildPilotScorecard(db)]);
  return ok({ funnel, scorecard });
});
