import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { getManageToken } from "@/lib/http/operator";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { businessProfileSchema, updateBusinessProfile } from "@/features/businesses/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A business corrects its own basic details (M10.2B).
 *
 * Manage-token only — deliberately NOT operator-or-manage-token like the
 * pricing route. An operator changing a merchant's contact details on their
 * behalf is a different act with different accountability, and nothing in this
 * milestone needs it.
 *
 * `updateBusinessProfile` does the authorisation itself against the slug in
 * this URL, so the business being edited is never taken from the request body.
 */
export const PATCH = route(async (request, context) => {
  const { slug } = await context.params;
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, businessProfileSchema);

  const db = await getDb();
  const manageToken = getManageToken(request);

  return runIdempotent(db, `businesses.profile:${slug}`, key, body, async () => {
    const result = await updateBusinessProfile(db, slug, manageToken, body);
    return { status: 200, body: { success: true, data: result } };
  });
});
