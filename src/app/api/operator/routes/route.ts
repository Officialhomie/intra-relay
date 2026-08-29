import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { ok } from "@/lib/http/response";
import { listOperatorQueue } from "@/features/routes/reads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  requireOperator(request);
  const db = await getDb();
  return ok(await listOperatorQueue(db));
});
