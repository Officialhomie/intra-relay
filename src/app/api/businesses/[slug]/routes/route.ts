import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken, getOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { HttpError } from "@/lib/http/response";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { createRoute, createRouteRequestSchema } from "@/features/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An operator or the business's own manage token adds a new service route.
 * Needs an operator key or the business's own manage token — otherwise anyone
 * who knows a business's public slug could create draft routes on it.
 */
export const POST = route(async (request, context) => {
  const { slug } = await context.params;
  const key = requireIdempotencyKey(request);

  const operator = getOperator(request);
  const db = await getDb();
  const canManage = await manageTokenMatchesBusinessSlug(db, slug, getManageToken(request));
  if (!operator && !canManage) {
    throw new HttpError(
      401,
      "SUPPLIER_AUTH_REQUIRED",
      "Adding a service needs an operator key or the business manage token.",
    );
  }

  const body = await parseJsonBody(request, createRouteRequestSchema);

  return runIdempotent(db, `routes.create:${slug}`, key, body, async () => {
    const created = await createRoute(db, slug, body);
    return { status: 201, body: { success: true, data: created } };
  });
});
