import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { runIdempotent } from "@/lib/http/idempotency";
import { parseJsonBody, requireIdempotencyKey } from "@/lib/http/request";
import { quickStartBusiness, quickStartSchema } from "@/features/businesses/quick-start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set a business up in one step (milestone 5 §4).
 *
 * Creates the business AND its first service. The service is DRAFT and the
 * business PENDING_VERIFICATION — an operator still checks the details before
 * any customer can reach them (BR-002). Faster setup, same gate.
 */
export const POST = route(async (request) => {
  const key = requireIdempotencyKey(request);
  const body = await parseJsonBody(request, quickStartSchema);
  const db = await getDb();

  return runIdempotent(db, "businesses.quick_start", key, body, async () => {
    const result = await quickStartBusiness(db, body);
    return {
      status: 201,
      body: {
        success: true,
        data: {
          business: { slug: result.business.slug, name: result.business.name },
          service: {
            name: result.route.name,
            pricingModel: result.route.pricingModel,
            priceAmount: result.route.priceAmount,
            priceUnit: result.route.priceUnit,
          },
          manageUrl: result.manageUrl,
          nextStep: result.nextStep,
        },
      },
    };
  });
});
