import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { ok } from "@/lib/http/response";
import { getPilotFunnel } from "@/features/analytics/pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pilot funnel (milestone 7 §33, §40) — counted entirely from real audit
 * rows. Operator-gated. Every number is a genuine count; 0 means no data, never
 * an estimate. There is no dashboard by design — this JSON is the instrument.
 */
export const GET = route(async (request) => {
  requireOperator(request);
  const db = await getDb();
  return ok(await getPilotFunnel(db));
});
