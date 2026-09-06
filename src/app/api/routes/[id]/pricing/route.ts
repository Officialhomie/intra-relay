import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken, getOperator } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { HttpError } from "@/lib/http/response";
import { manageTokenMatchesRoute } from "@/features/businesses/access";
import { updatePublishedPricing, updatePublishedPricingSchema } from "@/features/routes/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A business edits the price it publishes for one service (milestone 6 §19).
 *
 * Needs an operator key or the business's own manage token. This changes only
 * the published guidance on the service — it never touches a quote, so every
 * price a buyer has already agreed stays exactly as agreed.
 */
export const PATCH = route(async (request, context) => {
  const { id } = await context.params;
  const key = requireIdempotencyKey(request);

  const operator = getOperator(request);
  const db = await getDb();
  const canManage = await manageTokenMatchesRoute(db, id, getManageToken(request));
  if (!operator && !canManage) {
    throw new HttpError(
      401,
      "SUPPLIER_AUTH_REQUIRED",
      "Editing pricing needs an operator key or the business manage token.",
    );
  }

  const body = await parseJsonBody(request, updatePublishedPricingSchema);
  return runIdempotent(db, `routes.pricing:${id}`, key, body, async () => {
    const result = await updatePublishedPricing(db, id, body);
    return { status: 200, body: { success: true, data: result } };
  });
});
