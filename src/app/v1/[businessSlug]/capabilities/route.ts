import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { HttpError, ok } from "@/lib/http/response";
import { buildBusinessCapabilities } from "@/features/routes/capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, agent-readable capability document for a business and its quote
 * routes (TECHNICAL_SPEC §4). No auth. The order contact channel is included in
 * a route entry only while that route is ACTIVE.
 */
export const GET = route(async (_request, context) => {
  const { businessSlug } = await context.params;
  const db = await getDb();

  const capabilities = await buildBusinessCapabilities(db, businessSlug);
  if (!capabilities) {
    throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");
  }

  const response = ok(capabilities);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
