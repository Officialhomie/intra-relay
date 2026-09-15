/**
 * Canonical printing product identifiers (M10.6).
 *
 * A business's printing route serves more than flyers — the Tally onboarding
 * form already asks which of these it offers (`onboarding/tally-schema.ts`'s
 * `SERVICE_LABELS`). This is the internal identifier space those buyer-facing
 * labels map onto: stable, machine-readable, and independent of the exact
 * wording Tally (or any future form) uses.
 *
 * This list is deliberately the SAME 14 products the form already collects —
 * no new products are invented, and no per-product route/template exists yet
 * (that stays a single parameterised printing route; see `flyer-printing.ts`
 * and `onboarding/printing-mapping.ts`).
 */

export const PRINTING_PRODUCT_TYPES = [
  "business_cards",
  "flyers",
  "posters",
  "banners",
  "stickers",
  "brochures",
  "booklets",
  "invitations",
  "apparel",
  "packaging",
  "labels",
  "large_format",
  "signage",
  "documents",
] as const;

export type PrintingProductType = (typeof PRINTING_PRODUCT_TYPES)[number];

export function isPrintingProductType(value: string): value is PrintingProductType {
  return (PRINTING_PRODUCT_TYPES as readonly string[]).includes(value);
}
