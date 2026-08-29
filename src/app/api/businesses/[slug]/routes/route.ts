import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { createRoute, createRouteRequestSchema } from "@/features/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request, context) => {
  const { slug } = await context.params;
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, createRouteRequestSchema);
  const db = await getDb();

  return runIdempotent(db, `routes.create:${slug}`, key, body, async () => {
    const created = await createRoute(db, slug, body);
    return { status: 201, body: { success: true, data: created } };
  });
});
