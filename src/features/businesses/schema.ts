import { z } from "zod";

import { EVM_ADDRESS_REGEX } from "@/lib/address";
import { quoteCurrencySchema } from "@/features/routes/schema";

/**
 * Supplier / business schemas (F-SUP, PRD §10 Business).
 *
 * SAFETY (FR-SUP-003, NFR-SEC-001): these schemas intentionally contain NO
 * field for a seed phrase, private key, password, BVN, NIN, payment-card data,
 * or bank-login credential. The only wallet value is a *public* address.
 * There is a test asserting these keys never appear.
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
 * Onboarding form input (FR-SUP-001, FR-SUP-002).
 * `payoutAddress` is validated for format only in Phase 1 (see ADR-005).
 */
export const businessOnboardingSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter the business name.")
    .max(80, "That name is too long."),
  contactName: z
    .string()
    .trim()
    .min(2, "Enter the authorised contact's name.")
    .max(80, "That name is too long."),
  contactChannelType: contactChannelTypeSchema,
  contactChannelValue: z
    .string()
    .trim()
    .min(3, "Enter the number or email that receives orders.")
    .max(120, "That value is too long."),
  category: businessCategorySchema,
  city: z.string().trim().min(2, "Enter your city.").max(80, "That is too long."),
  country: z.string().trim().min(2, "Enter your country.").max(80, "That is too long."),
  quoteCurrency: quoteCurrencySchema,
  payoutAddress: z
    .string()
    .trim()
    .regex(
      EVM_ADDRESS_REGEX,
      "Enter a valid public EVM/Celo address (0x followed by 40 characters).",
    ),
  consentToQuoteDisplay: z.boolean().refine((value) => value === true, {
    message: "You must consent to Intra requesting and displaying a quote for your business.",
  }),
});
export type BusinessOnboardingInput = z.infer<typeof businessOnboardingSchema>;

/**
 * Persisted business shape (PRD §10). Not stored in Phase 1 — this only types
 * the draft object a supplier reviews.
 */
export const businessStatusSchema = z.enum(["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "PAUSED"]);
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
  payoutAddress: z.string().regex(EVM_ADDRESS_REGEX),
  quoteCurrency: quoteCurrencySchema,
  consentAt: z.string().datetime().nullable(),
  status: businessStatusSchema,
});
export type Business = z.infer<typeof businessSchema>;
