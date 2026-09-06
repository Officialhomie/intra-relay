import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import {
  describePricing,
  servicePricingInputSchema,
  type ServicePricing,
  type ServicePricingInput,
} from "@/features/pricing/model";

import { findRouteById, updateRoute } from "./repository";

/**
 * A business editing the price it publishes for a service (milestone 6 §19).
 *
 * This is a real, ordinary commercial need, and it is explicitly *not* the same
 * as changing a quote:
 *
 *  - Published pricing is guidance a buyer can compare before asking. It lives
 *    on the route (`quote_routes`).
 *  - A quote is a commitment on one specific job. It lives on `quotes`, and once
 *    a buyer has accepted one, its terms are immutable — a different price is a
 *    new row the buyer must decide on (milestone 5 §6, `quotes/revision.ts`).
 *
 * So editing published pricing here never reads or writes a `quotes` row. Every
 * historical accepted quote keeps exactly the amount the buyer agreed.
 */

export { servicePricingInputSchema as updatePublishedPricingSchema };
export type UpdatePublishedPricingInput = ServicePricingInput;

export interface PublishedPricingUpdate {
  route: QuoteRouteRow;
  pricing: ServicePricing;
  summary: string;
}

function toServicePricing(input: ServicePricingInput, currency: string): ServicePricing {
  if (input.model === "QUOTE_REQUIRED" || input.amount === null) {
    return { model: "QUOTE_REQUIRED", published: null };
  }
  return {
    model: input.model,
    published: { amount: input.amount, currency, unit: input.unit },
  };
}

export async function updatePublishedPricing(
  db: Database,
  routeId: string,
  input: UpdatePublishedPricingInput,
): Promise<PublishedPricingUpdate> {
  const parsed = servicePricingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      422,
      "INVALID_PRICING",
      "That pricing isn't valid.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const route = await findRouteById(db, routeId);
  if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "No service with that id.");

  const value = parsed.data;
  const now = new Date();
  const priceAmount =
    value.model === "QUOTE_REQUIRED" || value.amount === null ? null : value.amount.toFixed(2);
  const priceUnit = value.model === "QUOTE_REQUIRED" ? null : (value.unit ?? null);

  const updated = await updateRoute(db, route.id, {
    pricingModel: value.model,
    priceAmount,
    priceUnit,
    priceUpdatedAt: now,
    updatedAt: now,
  });

  const pricing = toServicePricing(value, route.quoteCurrency);

  await appendAuditEvent(db, {
    type: "route.pricing_updated",
    businessId: route.businessId,
    routeId: route.id,
    data: {
      from: {
        model: route.pricingModel,
        amount: route.priceAmount,
        unit: route.priceUnit,
      },
      to: { model: value.model, amount: priceAmount, unit: priceUnit },
    },
  });

  return { route: updated, pricing, summary: describePricing(pricing) };
}
