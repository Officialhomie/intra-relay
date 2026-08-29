import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { businesses, quoteRoutes } from "@/lib/db/schema";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: ACTIVE routes a buyer can send a request to (default: flyer printing). */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get("routeSlug") ?? "flyer-printing";
  const db = await getDb();

  const rows = await db
    .select({
      routeId: quoteRoutes.id,
      routeSlug: quoteRoutes.slug,
      routeName: quoteRoutes.name,
      responseSlaMinutes: quoteRoutes.responseSlaMinutes,
      priceUpdatedAt: quoteRoutes.priceUpdatedAt,
      quoteCurrency: quoteRoutes.quoteCurrency,
      businessSlug: businesses.slug,
      businessName: businesses.name,
      city: businesses.city,
      country: businesses.country,
    })
    .from(quoteRoutes)
    .innerJoin(businesses, eq(quoteRoutes.businessId, businesses.id))
    .where(and(eq(quoteRoutes.slug, slug), eq(quoteRoutes.status, "ACTIVE")));

  return ok(rows);
});
