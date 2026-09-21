import type { Database } from "@/lib/db/client";
import type { QuoteRouteRow } from "@/lib/db/schema";
import {
  LAGOS_AREA_VOCABULARY_VERSION,
  LAGOS_CITY_ID,
  canonicalizeLegacyArea,
} from "@/features/locations/lagos";
import type { PricingModel } from "@/features/pricing/model";

import { FLYER_PRINTING_INPUT_FIELDS } from "./flyer-printing";
import { updateRoute } from "./repository";

export interface PrintingRouteFacts {
  productTypes: string[];
  pricingModel: PricingModel;
  serviceArea: string | null;
  city: string | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  turnaround: string | null;
  minimumOrders: Record<string, number> | null;
}

/** Shared destination for structured printing facts from Tally or
 * conversation. The route/capability model remains the single source of truth. */
export async function applyPrintingRouteFacts(
  db: Database,
  route: QuoteRouteRow,
  facts: PrintingRouteFacts,
): Promise<QuoteRouteRow> {
  const canonicalAreas =
    facts.city?.trim().toLowerCase() === "lagos" ? canonicalizeLegacyArea(facts.serviceArea) : null;
  return updateRoute(db, route.id, {
    inputSchema: [
      ...FLYER_PRINTING_INPUT_FIELDS,
      {
        key: "productType",
        label: "Which printing product do you need?",
        example: facts.productTypes[0] ?? "flyers",
        required: false,
        options: facts.productTypes,
      },
    ],
    pricingModel: facts.pricingModel,
    serviceArea: facts.serviceArea,
    pickupAvailable: facts.pickupAvailable,
    deliveryAvailable: facts.deliveryAvailable,
    typicalTurnaround: facts.turnaround,
    minimumOrders: facts.minimumOrders,
    // Free-text onboarding is evidence of explicitly listed areas, not proof
    // of exhaustive coverage. Keep it advisory pending review.
    canonicalDeliveryCoverage:
      canonicalAreas && canonicalAreas.length > 0
        ? {
            country: "NG",
            cityId: LAGOS_CITY_ID,
            areaIds: canonicalAreas,
            vocabularyVersion: LAGOS_AREA_VOCABULARY_VERSION,
            completeness: "PARTIAL",
            method: "EXACT_TOKEN_LIST",
            reviewState: "PENDING",
          }
        : null,
  });
}
