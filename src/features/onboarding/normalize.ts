import {
  NON_SERVICE_FIELD_LABELS,
  SERVICE_LABELS,
  servicePricingLabels,
  type TallyField,
  type TallyWebhookPayload,
} from "./tally-schema";
import type { OnboardingIssue } from "./status";
import type { PricingModel } from "@/features/pricing/model";

/**
 * Turn a raw Tally submission into a plain, typed shape (M10.1).
 *
 * This is intentionally dumb: it reads exactly what the business answered and
 * nothing else. It never invents a value, never guesses a price out of free
 * text, and never repairs an inconsistent answer — anything it cannot read
 * cleanly comes back as `null` plus an entry in `issues`, for
 * `validate.ts` (or an operator) to act on.
 */

export interface NormalizedService {
  /** One of the 14 named services, or the free-text answer under "Other". */
  label: string;
  pricingModel: PricingModel | null;
  /** Free text as the business typed it, e.g. "₦5,000 per 100". Never parsed into a number here. */
  priceText: string | null;
  notes: string | null;
}

export interface NormalizedOnboarding {
  businessName: string | null;
  ownerContactName: string | null;
  whatsappNumber: string | null;
  altContact: string | null;
  city: string | null;
  serviceArea: string | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  services: NormalizedService[];
  turnaround: string | null;
  responseTime: "30m" | "2h" | "same_day" | "next_day" | null;
  operatingHours: string | null;
  hasWallet: boolean | null;
  payoutAddress: string | null;
  evidenceType: string | null;
  evidenceLink: string | null;
  consentGiven: boolean;
}

function byLabel(fields: TallyField[], label: string): TallyField | undefined {
  return fields.find((f) => f.label.trim() === label);
}

/** Resolve a field's answer to plain string(s), following its `options` id->text map when present. */
function resolveChoice(field: TallyField | undefined): string[] {
  if (!field) return [];
  const raw = Array.isArray(field.value) ? field.value : field.value == null ? [] : [field.value];
  const optionMap = new Map((field.options ?? []).map((o) => [o.id, o.text]));
  return raw.map((v) => {
    const s = String(v);
    return optionMap.get(s) ?? s;
  });
}

function resolveText(field: TallyField | undefined): string | null {
  if (!field || field.value == null) return null;
  const s = String(field.value).trim();
  return s.length > 0 ? s : null;
}

function resolveSingleChoice(field: TallyField | undefined): string | null {
  const [first] = resolveChoice(field);
  return first ?? null;
}

const PRICING_MODEL_BY_LABEL: Record<string, PricingModel> = {
  "Fixed price": "FIXED",
  "Starting from a price": "STARTING_FROM",
  "I need to see the job first": "QUOTE_REQUIRED",
};

const RESPONSE_TIME_BY_LABEL: Record<string, NormalizedOnboarding["responseTime"]> = {
  "Within 30 minutes": "30m",
  "Within 2 hours": "2h",
  "Same day": "same_day",
  "Next working day": "next_day",
};

function normalizeService(
  fields: TallyField[],
  label: string,
  issues: OnboardingIssue[],
): NormalizedService {
  const labels = servicePricingLabels(label);
  const pricingModelText = resolveSingleChoice(byLabel(fields, labels.pricingModel));
  const pricingModel = pricingModelText ? (PRICING_MODEL_BY_LABEL[pricingModelText] ?? null) : null;
  if (pricingModelText && !pricingModel) {
    issues.push({
      field: `services.${label}.pricingModel`,
      message: `Unrecognized pricing-model answer "${pricingModelText}" for ${label}.`,
    });
  }
  return {
    label,
    pricingModel,
    priceText: resolveText(byLabel(fields, labels.price)),
    notes: resolveText(byLabel(fields, labels.notes)),
  };
}

export function normalizeTallySubmission(payload: TallyWebhookPayload): {
  data: NormalizedOnboarding;
  issues: OnboardingIssue[];
} {
  const fields = payload.data.fields;
  const issues: OnboardingIssue[] = [];
  const L = NON_SERVICE_FIELD_LABELS;

  const pickupText = resolveSingleChoice(byLabel(fields, L.pickup_available));
  const deliveryText = resolveSingleChoice(byLabel(fields, L.delivery_available));
  const walletText = resolveSingleChoice(byLabel(fields, L.has_wallet));
  const responseTimeText = resolveSingleChoice(byLabel(fields, L.response_time));
  const consentText = resolveSingleChoice(byLabel(fields, L.consent));

  const servicesField = byLabel(fields, L.services_offered);
  const selectedServiceLabels = resolveChoice(servicesField);
  // Anything selected that isn't one of the 14 named services is the
  // free-text "Other" answer (or, defensively, an unrecognized option) —
  // both are represented as their own service entry rather than dropped.
  const services = selectedServiceLabels.map((selected) => {
    const known = (SERVICE_LABELS as readonly string[]).includes(selected);
    const pricingLookupLabel = known ? selected : "Other";
    const normalized = normalizeService(fields, pricingLookupLabel, issues);
    // Keep the business's own wording as the service label even when it fell
    // through the "Other" pricing group.
    return { ...normalized, label: selected };
  });

  const responseTime = responseTimeText ? (RESPONSE_TIME_BY_LABEL[responseTimeText] ?? null) : null;
  if (responseTimeText && !responseTime) {
    issues.push({
      field: "responseTime",
      message: `Unrecognized reply-speed answer "${responseTimeText}".`,
    });
  }

  return {
    data: {
      businessName: resolveText(byLabel(fields, L.business_name)),
      ownerContactName: resolveText(byLabel(fields, L.owner_contact_name)),
      whatsappNumber: resolveText(byLabel(fields, L.whatsapp_number)),
      altContact: resolveText(byLabel(fields, L.alt_contact)),
      city: resolveText(byLabel(fields, L.city)),
      serviceArea: resolveText(byLabel(fields, L.service_area)),
      pickupAvailable: pickupText ? pickupText === "Yes" : null,
      deliveryAvailable: deliveryText ? deliveryText === "Yes" : null,
      services,
      turnaround: resolveText(byLabel(fields, L.turnaround)),
      responseTime,
      operatingHours: resolveText(byLabel(fields, L.operating_hours)),
      hasWallet: walletText ? walletText === "Yes" : null,
      payoutAddress: walletText === "Yes" ? resolveText(byLabel(fields, L.payout_address)) : null,
      evidenceType: resolveSingleChoice(byLabel(fields, L.business_evidence_type)),
      evidenceLink: resolveText(byLabel(fields, L.business_evidence_link)),
      consentGiven: consentText === "I agree",
    },
    issues,
  };
}
