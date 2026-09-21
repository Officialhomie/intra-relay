import type { PricingModel } from "@/features/pricing/model";
import {
  PRINTING_PRODUCT_TYPES,
  type PrintingProductType,
} from "@/features/routes/printing-products";

import { SERVICE_LABELS } from "./tally-schema";
import type { NormalizedService } from "./normalize";

/**
 * Turning the Tally `services[]` answer into the route's canonical
 * `productType` options and a single route-level pricing model (M10.6).
 *
 * Both functions are pure and deliberately conservative: neither ever
 * invents a value. A service this app cannot confidently place is reported
 * back for an operator, never silently dropped and never silently guessed.
 */

/** Exact 1:1 mapping from Tally's own label text to the canonical identifier
 * (`routes/printing-products.ts`). Kept here, not on the canonical list
 * itself, so the canonical vocabulary stays independent of Tally's wording. */
const PRODUCT_TYPE_BY_LABEL: Record<(typeof SERVICE_LABELS)[number], PrintingProductType> = {
  "Business cards": "business_cards",
  Flyers: "flyers",
  Posters: "posters",
  Banners: "banners",
  Stickers: "stickers",
  Brochures: "brochures",
  Booklets: "booklets",
  Invitations: "invitations",
  "T-shirts / apparel printing": "apparel",
  Packaging: "packaging",
  Labels: "labels",
  "Large-format printing": "large_format",
  Signage: "signage",
  Documents: "documents",
};

export interface ProductTypeMapping {
  /** Canonical product types this business supports, deduplicated, in a
   * stable order (the canonical list's order, not the submission's). */
  productTypes: PrintingProductType[];
  /** Submitted service labels that do not match one of the 14 known
   * products — a free-text "Other" answer, most commonly. Never discarded;
   * the caller decides how to surface these (M10.6 item 7). */
  unmapped: string[];
}

export function mapMinimumOrders(services: NormalizedService[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const service of services) {
    const productType = PRODUCT_TYPE_BY_LABEL[service.label as (typeof SERVICE_LABELS)[number]];
    if (productType && service.minimumOrder !== null) out[productType] = service.minimumOrder;
  }
  return out;
}

/** Map every submitted service to its canonical product type. A label that
 * does not match one of the 14 known services (the free-text "Other" answer,
 * or defensively anything unrecognised) is reported in `unmapped` rather than
 * forced into a guessed product type. */
export function mapServicesToProductTypes(services: NormalizedService[]): ProductTypeMapping {
  const found = new Set<PrintingProductType>();
  const unmapped: string[] = [];
  for (const service of services) {
    const productType = PRODUCT_TYPE_BY_LABEL[service.label as (typeof SERVICE_LABELS)[number]];
    if (productType) found.add(productType);
    else unmapped.push(service.label);
  }
  return {
    productTypes: PRINTING_PRODUCT_TYPES.filter((p) => found.has(p)),
    unmapped,
  };
}

export interface PricingResolution {
  /** The single pricing model the route should use. */
  model: PricingModel;
  /** True when the submitted services disagreed on a pricing model — `model`
   * is then the safe `QUOTE_REQUIRED` fallback, never a guess at which one
   * was "right", and the caller should flag this for operator review. */
  mixed: boolean;
}

/**
 * A `quote_routes` row has exactly one `pricingModel` — it cannot represent
 * "business cards are FIXED but banners are QUOTE_REQUIRED" without a new
 * table (explicitly out of scope). When every submitted service agrees, that
 * shared model is genuinely representative and safe to use. When they
 * disagree, the only honest single value is `QUOTE_REQUIRED` — it never
 * overclaims a fixed or starting-from price the business did not
 * unanimously state. The full per-service detail is never lost; it stays in
 * `onboarding_submissions.normalizedData` regardless of what this resolves to.
 */
export function resolvePricingModel(services: NormalizedService[]): PricingResolution {
  const models = new Set(services.map((s) => s.pricingModel).filter((m): m is PricingModel => !!m));
  if (models.size === 1) {
    return { model: [...models][0], mixed: false };
  }
  return { model: "QUOTE_REQUIRED", mixed: true };
}
