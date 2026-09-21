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

const PRINTING_PRODUCT_ALIASES: ReadonlyArray<[RegExp, PrintingProductType]> = [
  [/\b(?:flyer|flier|leaflet|handbill)s?\b/i, "flyers"],
  [/\bbusiness cards?\b/i, "business_cards"],
  [/\bposters?\b/i, "posters"],
  [/\bbanners?\b/i, "banners"],
  [/\bstickers?\b/i, "stickers"],
  [/\bbrochures?\b/i, "brochures"],
  [/\bbooklets?\b/i, "booklets"],
  [/\binvitations?\b/i, "invitations"],
  [/\b(?:t-?shirts?|apparel)\b/i, "apparel"],
  [/\bpackaging\b/i, "packaging"],
  [/\blabels?\b/i, "labels"],
  [/\blarge[- ]format\b/i, "large_format"],
  [/\bsignage\b/i, "signage"],
  [/\bdocuments?\b/i, "documents"],
];

export function isPrintingProductType(value: string): value is PrintingProductType {
  return (PRINTING_PRODUCT_TYPES as readonly string[]).includes(value);
}

/** One shared human-language alias map for buyer demand and business supply. */
export function extractPrintingProductTypes(text: string): PrintingProductType[] {
  return PRINTING_PRODUCT_ALIASES.filter(([pattern]) => pattern.test(text)).map(([, type]) => type);
}
