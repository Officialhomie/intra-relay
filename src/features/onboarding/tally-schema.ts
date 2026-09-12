import { z } from "zod";

/**
 * The Tally `FORM_RESPONSE` webhook envelope (M10.1).
 *
 * Verified against Tally's own docs (`tally.so/help/webhooks`), not guessed.
 * Deliberately permissive on `fields[]` shape — Tally's field `type` varies
 * per question type and this module does not need to model all of them, only
 * read `key`/`label`/`value`/`options` generically. Anything this schema
 * cannot parse fails closed into a parse error, never a best-effort guess.
 */

export const tallyOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const tallyFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  value: z.unknown(),
  options: z.array(tallyOptionSchema).optional(),
});
export type TallyField = z.infer<typeof tallyFieldSchema>;

export const tallyWebhookPayloadSchema = z.object({
  eventId: z.string(),
  eventType: z.literal("FORM_RESPONSE"),
  createdAt: z.string(),
  data: z.object({
    responseId: z.string(),
    submissionId: z.string(),
    respondentId: z.string().optional(),
    formId: z.string(),
    formName: z.string().optional(),
    createdAt: z.string().optional(),
    submissionPdfUrl: z.string().nullable().optional(),
    submissionPreviewUrl: z.string().nullable().optional(),
    fields: z.array(tallyFieldSchema),
  }),
});
export type TallyWebhookPayload = z.infer<typeof tallyWebhookPayloadSchema>;

/**
 * Question label -> internal field key, for the printing-onboarding form
 * (Tally form `aQR55X`, built via the Tally MCP this session).
 *
 * Matched by label rather than Tally's opaque `key` (which is very likely the
 * question's stable id, but that is an inference from Tally's docs, not a
 * confirmed fact — nothing in this codebase has received a real Tally webhook
 * yet). Label text is exactly what this session wrote into the form and is
 * unambiguous today. If the form's questions are ever reworded, this map
 * must be updated in the same change — a stale label match fails closed (the
 * field is simply not found, which `normalize.ts` treats as missing, never a
 * guess) rather than silently mismatching.
 */
export const NON_SERVICE_FIELD_LABELS = {
  business_name: "What is your business name?",
  owner_contact_name: "What's your name?",
  whatsapp_number: "What's your WhatsApp number?",
  alt_contact: "Any other way to reach you?",
  city: "Which city/area are you based in?",
  service_area: "Which areas can you deliver to or accept pick-up from?",
  pickup_available: "Can customers pick up their order from you?",
  delivery_available: "Do you deliver to customers?",
  services_offered: "Which printing services do you offer?",
  turnaround: "What's your usual turnaround time?",
  response_time: "How quickly do you normally reply to a new request?",
  operating_hours: "What days/hours are you open?",
  has_wallet: "Do you have a Celo wallet address you'd like customer payments sent to?",
  payout_address: "What's the wallet address?",
  business_evidence_type: "How can we see that your business is real?",
  business_evidence_link: "Share the link",
  consent:
    "I understand I stay in control of my prices and can accept or decline any request. I'd like Intra to send me customer requests.",
} as const;

/** The 14 named services this form offers, in the exact label text used on the Services page. */
export const SERVICE_LABELS = [
  "Business cards",
  "Flyers",
  "Posters",
  "Banners",
  "Stickers",
  "Brochures",
  "Booklets",
  "Invitations",
  "T-shirts / apparel printing",
  "Packaging",
  "Labels",
  "Large-format printing",
  "Signage",
  "Documents",
] as const;
export type ServiceLabel = (typeof SERVICE_LABELS)[number];

/** The per-service pricing question labels, parameterised by the service's own label. */
export function servicePricingLabels(service: string): {
  pricingModel: string;
  price: string;
  notes: string;
} {
  if (service === "Other") {
    return {
      pricingModel: "How do you price the other service(s) you print?",
      price: "What's the price?",
      notes: "Minimum order, and what changes the price?",
    };
  }
  return {
    pricingModel: `How do you price ${service}?`,
    price: `What's the price for ${service}?`,
    notes: `Minimum order, and what changes the price, for ${service}?`,
  };
}
