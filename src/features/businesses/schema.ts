import { z } from "zod";

import { EVM_ADDRESS_REGEX } from "@/lib/address";
import { quoteCurrencySchema } from "@/features/routes/schema";

/**
 * Supplier / business schemas (F-SUP, PRD §10 Business).
 *
 * SAFETY (FR-SUP-003, NFR-SEC-001): these schemas intentionally contain NO
 * field for a seed phrase, private key, password, BVN, NIN, payment-card data,
 * bank-login credential, or a home / street address. The only wallet value is a
 * *public* payout address, and it is only required when the merchant enables a
 * paid agent query. There is a test asserting the prohibited keys never appear.
 */

export const BUSINESS_CATEGORIES = ["printing", "design", "catering", "delivery", "other"] as const;
export const businessCategorySchema = z.enum(BUSINESS_CATEGORIES, {
  message: "Choose a category.",
});
export type BusinessCategory = z.infer<typeof businessCategorySchema>;

export const CONTACT_CHANNEL_TYPES = ["whatsapp", "email", "phone"] as const;
export const contactChannelTypeSchema = z.enum(CONTACT_CHANNEL_TYPES, {
  message: "Choose how you receive orders.",
});
export type ContactChannelType = z.infer<typeof contactChannelTypeSchema>;

/**
 * How quickly the merchant commits to replying to a quote request. Drives the
 * route's `responseSlaMinutes` and the "quote response expectation" an agent
 * reads on the Capability Card (FR-ROUTE-001, PRD §9 BR-003).
 */
export const QUOTE_RESPONSE_TIMES = ["30m", "2h", "same_day", "next_day"] as const;
export const quoteResponseTimeSchema = z.enum(QUOTE_RESPONSE_TIMES, {
  message: "Choose how quickly you reply to a quote request.",
});
export type QuoteResponseTime = z.infer<typeof quoteResponseTimeSchema>;

export const QUOTE_RESPONSE_TIME_MINUTES: Record<QuoteResponseTime, number> = {
  "30m": 30,
  "2h": 120,
  same_day: 480,
  next_day: 1440,
};
export const QUOTE_RESPONSE_TIME_LABELS: Record<QuoteResponseTime, string> = {
  "30m": "Within 30 minutes",
  "2h": "Within 2 hours",
  same_day: "Same day",
  next_day: "Next working day",
};

/**
 * Onboarding form fields (FR-SUP-001, FR-SUP-002, FR-SUP-005). Introspected by a
 * safety test via `.shape`; the parseable schema is `businessOnboardingSchema`,
 * which adds the conditional payout-address rule.
 */
export const businessOnboardingObject = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter the business name.")
    .max(80, "That name is too long."),
  contactName: z
    .string()
    .trim()
    .min(2, "Enter the name of the person who can answer for the business.")
    .max(80, "That name is too long."),
  contactChannelType: contactChannelTypeSchema,
  contactChannelValue: z
    .string()
    .trim()
    .min(3, "Enter the WhatsApp number, email, or phone that receives orders.")
    .max(120, "That value is too long."),
  category: businessCategorySchema,
  city: z.string().trim().min(2, "Enter your city.").max(80, "That is too long."),
  country: z.string().trim().min(2, "Enter your country.").max(80, "That is too long."),
  /** Plain-language description of what this service can do — shown to agents. */
  serviceSummary: z
    .string()
    .trim()
    .min(10, "Describe your service in a sentence so an agent understands it.")
    .max(280, "Keep this under 280 characters."),
  /** Where the merchant delivers to or accepts pick-up from. */
  serviceArea: z
    .string()
    .trim()
    .min(3, "Add the areas you deliver to or accept pick-up from.")
    .max(120, "That is too long."),
  operatingHours: z
    .string()
    .trim()
    .min(3, "Add the days and hours you are open.")
    .max(120, "That is too long."),
  turnaround: z
    .string()
    .trim()
    .min(3, "Add how long a typical job takes.")
    .max(120, "That is too long."),
  quoteResponseTime: quoteResponseTimeSchema,
  quoteCurrency: quoteCurrencySchema,
  /** When false, no query fee and no payout address is collected (PRODUCT_VISION §5). */
  wantsPaidQueries: z.boolean(),
  /** Public EVM/Celo address. Required only when `wantsPaidQueries` is true. */
  payoutAddress: z.string().trim(),
  consentToQuoteDisplay: z.boolean().refine((value) => value === true, {
    message: "You must consent to Intra requesting and displaying a quote for your business.",
  }),
});

export const businessOnboardingSchema = businessOnboardingObject.refine(
  (value) => !value.wantsPaidQueries || EVM_ADDRESS_REGEX.test(value.payoutAddress),
  {
    path: ["payoutAddress"],
    message: "Enter a valid public EVM/Celo address (0x followed by 40 characters).",
  },
);
export type BusinessOnboardingInput = z.infer<typeof businessOnboardingSchema>;

/**
 * Persisted business shape (PRD §10). Not stored during onboarding — this only
 * types the draft object a supplier reviews before an operator creates it.
 */
export const BUSINESS_STATUSES = ["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "PAUSED"] as const;
export const businessStatusSchema = z.enum(BUSINESS_STATUSES);
export type BusinessStatus = z.infer<typeof businessStatusSchema>;

export const businessSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().min(1),
  contactChannel: z.object({
    type: contactChannelTypeSchema,
    value: z.string().min(1),
  }),
  category: businessCategorySchema,
  location: z.object({ city: z.string().min(1), country: z.string().min(1) }),
  serviceSummary: z.string().min(1),
  serviceArea: z.string().min(1),
  operatingHours: z.string().min(1),
  turnaround: z.string().min(1),
  quoteResponseTime: quoteResponseTimeSchema,
  /** Null when the merchant did not enable paid agent queries. */
  payoutAddress: z.string().regex(EVM_ADDRESS_REGEX).nullable(),
  quoteCurrency: quoteCurrencySchema,
  consentAt: z.string().datetime().nullable(),
  status: businessStatusSchema,
});
export type Business = z.infer<typeof businessSchema>;
