import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { createBusiness, createBusinessRequestSchema } from "@/features/businesses/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, createBusinessRequestSchema);
  const db = await getDb();

  return runIdempotent(db, "businesses.create", key, body, async () => {
    const business = await createBusiness(db, body);
    return { status: 201, body: { success: true, data: business } };
  });
});
