import {
  NON_SERVICE_FIELD_LABELS,
  SERVICE_LABELS,
  servicePricingLabels,
  type TallyField,
  type TallyWebhookPayload,
} from "../tally-schema";

/**
 * Builds a realistic `FORM_RESPONSE` webhook payload for the printing
 * onboarding form, for onboarding tests only.
 *
 * Covers BOTH plausible Tally `fields[].value` shapes for a choice question
 * (this session never received a real webhook, so which one Tally actually
 * sends is unconfirmed — see `docs/M10.1-TALLY-INTRA-ONBOARDING.md` §14):
 * `useOptionIds: true` (default) sends option ids plus an `options` id->text
 * map, like a real multi-select; `false` sends the option's own text as the
 * value directly, the documented fallback `normalize.ts` also handles.
 */

let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

export type PricingModelLabel =
  "Fixed price" | "Starting from a price" | "I need to see the job first";

export interface ServiceAnswer {
  label: string;
  pricingModel?: PricingModelLabel;
  priceText?: string;
  notes?: string;
  minimumOrder?: number;
}

export interface BuildTallyPayloadOptions {
  formId?: string;
  submissionId?: string;
  eventId?: string;
  submissionPreviewUrl?: string | null;
  businessName?: string | null;
  ownerContactName?: string | null;
  whatsappNumber?: string | null;
  altContact?: string | null;
  city?: string | null;
  serviceArea?: string | null;
  /** `null` simulates the question being left unanswered (never selected),
   * distinct from omitting the key entirely (which defaults to "Yes"). */
  pickupAvailable?: "Yes" | "No" | null;
  deliveryAvailable?: "Yes" | "No" | null;
  services?: ServiceAnswer[];
  turnaround?: string | null;
  responseTime?: "Within 30 minutes" | "Within 2 hours" | "Same day" | "Next working day";
  operatingHours?: string | null;
  hasWallet?: "Yes" | "Not yet";
  payoutAddress?: string | null;
  evidenceType?: string;
  evidenceLink?: string | null;
  consentGiven?: boolean;
  useOptionIds?: boolean;
}

export const DEFAULT_FORM_ID = "aQR55X";

function field(
  label: string,
  type: string,
  value: unknown,
  options?: TallyField["options"],
): TallyField {
  return { key: uid("field"), label, type, value, options };
}

export function buildTallyPayload(opts: BuildTallyPayloadOptions = {}): TallyWebhookPayload {
  const useOptionIds = opts.useOptionIds ?? true;
  const services = opts.services ?? [
    {
      label: "Business cards",
      pricingModel: "Fixed price",
      priceText: "N5,000 per 100",
      notes: "Minimum 100",
    },
  ];
  const L = NON_SERVICE_FIELD_LABELS;

  function choiceField(label: string, selectedTexts: string[], universe: string[]): TallyField {
    if (!useOptionIds) {
      const value = selectedTexts.length <= 1 ? (selectedTexts[0] ?? null) : selectedTexts;
      return field(label, "MULTIPLE_CHOICE_OPTION", value);
    }
    const allTexts = Array.from(new Set([...universe, ...selectedTexts]));
    const options = allTexts.map((text) => ({ id: uid("opt"), text }));
    const idFor = (text: string) => options.find((o) => o.text === text)!.id;
    const selectedIds = selectedTexts.map(idFor);
    const value = selectedIds.length <= 1 ? (selectedIds[0] ?? null) : selectedIds;
    return field(label, "MULTIPLE_CHOICE_OPTION", value, options);
  }

  const serviceUniverse = Array.from(
    new Set([...SERVICE_LABELS, "Other", ...services.map((s) => s.label)]),
  );

  const serviceFields = services.flatMap((s) => {
    const known = (SERVICE_LABELS as readonly string[]).includes(s.label);
    const labels = servicePricingLabels(known ? s.label : "Other");
    return [
      choiceField(labels.pricingModel, s.pricingModel ? [s.pricingModel] : [], [
        "Fixed price",
        "Starting from a price",
        "I need to see the job first",
      ]),
      field(labels.price, "INPUT_TEXT", s.priceText ?? null),
      field(labels.notes, "TEXTAREA", s.notes ?? null),
      field(labels.minimumOrder, "NUMBER", s.minimumOrder ?? null),
    ];
  });

  // `??` would treat an explicit `null` (meaning "left blank") the same as
  // `undefined` (meaning "use the default") — a test asking for a blank
  // business name must actually get one, so defaulting only applies when the
  // key was never passed at all.
  const withDefault = <K extends keyof BuildTallyPayloadOptions>(
    key: K,
    fallback: BuildTallyPayloadOptions[K],
  ) => (key in opts ? opts[key] : fallback);

  const fields: TallyField[] = [
    field(L.business_name, "INPUT_TEXT", withDefault("businessName", "Yaba Prints")),
    field(L.owner_contact_name, "INPUT_TEXT", withDefault("ownerContactName", "Ada Obi")),
    field(L.whatsapp_number, "INPUT_PHONE_NUMBER", withDefault("whatsappNumber", "+2348012345678")),
    field(L.alt_contact, "INPUT_TEXT", withDefault("altContact", null)),
    field(L.city, "INPUT_TEXT", withDefault("city", "Lagos")),
    field(L.service_area, "INPUT_TEXT", withDefault("serviceArea", "Yaba and Akoka")),
    (() => {
      const pickup = withDefault("pickupAvailable", "Yes" as "Yes" | "No" | null);
      return choiceField(L.pickup_available, pickup ? [pickup] : [], ["Yes", "No"]);
    })(),
    (() => {
      const delivery = withDefault("deliveryAvailable", "Yes" as "Yes" | "No" | null);
      return choiceField(L.delivery_available, delivery ? [delivery] : [], ["Yes", "No"]);
    })(),
    choiceField(
      L.services_offered,
      services.map((s) => s.label),
      serviceUniverse,
    ),
    ...serviceFields,
    field(L.turnaround, "INPUT_TEXT", withDefault("turnaround", "2 working days")),
    choiceField(
      L.response_time,
      [opts.responseTime ?? "Within 2 hours"],
      ["Within 30 minutes", "Within 2 hours", "Same day", "Next working day"],
    ),
    field(L.operating_hours, "INPUT_TEXT", opts.operatingHours ?? "Mon-Sat 9am-6pm"),
    choiceField(L.has_wallet, [opts.hasWallet ?? "Not yet"], ["Yes", "Not yet"]),
    field(L.payout_address, "INPUT_TEXT", opts.payoutAddress ?? null),
    choiceField(
      L.business_evidence_type,
      [opts.evidenceType ?? "Instagram page"],
      ["Instagram page", "Facebook page", "Photos"],
    ),
    field(
      L.business_evidence_link,
      "INPUT_LINK",
      opts.evidenceLink ?? "https://instagram.com/yabaprints",
    ),
    choiceField(L.consent, opts.consentGiven === false ? [] : ["I agree"], ["I agree"]),
  ];

  return {
    eventId: opts.eventId ?? uid("evt"),
    eventType: "FORM_RESPONSE",
    createdAt: new Date().toISOString(),
    data: {
      responseId: uid("resp"),
      submissionId: opts.submissionId ?? uid("sub"),
      formId: opts.formId ?? DEFAULT_FORM_ID,
      submissionPreviewUrl:
        opts.submissionPreviewUrl ?? "https://tally.so/r/aQR55X/submission/preview",
      fields,
    },
  };
}
