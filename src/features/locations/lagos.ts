/** Reviewed, deliberately small Lagos pilot vocabulary. It is not a map. */
export const LAGOS_AREA_VOCABULARY_VERSION = "lagos-area-v1" as const;
export const LAGOS_CITY_ID = "lagos" as const;

export const LAGOS_AREA_IDS = [
  "lagos_yaba",
  "lagos_akoka",
  "lagos_surulere",
  "lagos_ikeja",
  "lagos_maryland",
  "lagos_lekki",
  "lagos_victoria_island",
] as const;
export type LagosAreaId = (typeof LAGOS_AREA_IDS)[number];

export interface CanonicalLocation {
  country: "NG";
  cityId: typeof LAGOS_CITY_ID;
  areaId: LagosAreaId;
  vocabularyVersion: typeof LAGOS_AREA_VOCABULARY_VERSION;
  /** Exact reviewed phrase when an alias, otherwise null. */
  alias: string | null;
}

export type CoverageCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type CanonicalizationMethod = "EXACT_ALIAS" | "EXACT_TOKEN_LIST" | "OPERATOR_REVIEW";
export type OperatorReviewState = "PENDING" | "APPROVED";

export interface CanonicalDeliveryCoverage {
  country: "NG";
  cityId: typeof LAGOS_CITY_ID;
  areaIds: LagosAreaId[];
  vocabularyVersion: typeof LAGOS_AREA_VOCABULARY_VERSION;
  completeness: CoverageCompleteness;
  method: CanonicalizationMethod;
  reviewState: OperatorReviewState;
}

export interface CanonicalPickupPoint extends CanonicalLocation {
  method: CanonicalizationMethod;
  reviewState: OperatorReviewState;
}

const ALIASES: Readonly<Record<string, LagosAreaId>> = {
  yaba: "lagos_yaba",
  "around yaba": "lagos_yaba",
  akoka: "lagos_akoka",
  surulere: "lagos_surulere",
  ikeja: "lagos_ikeja",
  maryland: "lagos_maryland",
  lekki: "lagos_lekki",
  "victoria island": "lagos_victoria_island",
  vi: "lagos_victoria_island",
};

export function normalizeLagosArea(raw: string | null | undefined): CanonicalLocation | null {
  const phrase = raw?.trim().toLowerCase();
  if (!phrase) return null;
  const areaId = ALIASES[phrase];
  if (!areaId) return null;
  return {
    country: "NG",
    cityId: LAGOS_CITY_ID,
    areaId,
    vocabularyVersion: LAGOS_AREA_VOCABULARY_VERSION,
    alias: phrase,
  };
}

/** Exact tokenized supplier mapping only; compound legacy text is never upgraded. */
export function canonicalizeLegacyArea(raw: string | null | undefined): LagosAreaId[] | null {
  if (!raw) return null;
  const parts = raw.split(",").map((part) => normalizeLagosArea(part));
  return parts.every((part) => part !== null) ? parts.map((part) => part!.areaId) : null;
}

/** Pure advisory canonical comparison. Callers decide whether an evidence result gates. */
export function evaluateCanonicalLocation(
  buyer: CanonicalLocation | null | undefined,
  delivery: CanonicalDeliveryCoverage | null | undefined,
  pickup: CanonicalPickupPoint | null | undefined,
  method: "delivery" | "pickup",
): "MATCH" | "NO_MATCH" | "UNKNOWN" {
  if (!buyer) return "UNKNOWN";
  if (method === "pickup") {
    if (!pickup) return "UNKNOWN";
    if (buyer.cityId !== pickup.cityId) return "NO_MATCH";
    return buyer.areaId === pickup.areaId ? "MATCH" : "NO_MATCH";
  }
  if (!delivery) return "UNKNOWN";
  if (buyer.cityId !== delivery.cityId) return "NO_MATCH";
  if (delivery.areaIds.includes(buyer.areaId)) return "MATCH";
  return delivery.completeness === "COMPLETE" ? "NO_MATCH" : "UNKNOWN";
}
