import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { BusinessRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { EVM_ADDRESS_REGEX, normalizeEvmAddress } from "@/lib/address";
import { slugify } from "@/lib/slug";
import { quoteCurrencySchema } from "@/features/routes/schema";
import { appendAuditEvent } from "@/features/audit/repository";

import { findBusinessBySlug, insertBusiness } from "./repository";
import { businessCategorySchema, contactChannelTypeSchema } from "./schema";

/**
 * `POST /api/businesses` payload (FR-SUP-001, FR-SUP-002).
 *
 * Exactly the fields `createBusiness` persists — no field for prohibited data
 * (FR-SUP-003). The onboarding form's extra service metadata and its
 * `wantsPaidQueries` toggle are draft-only; this endpoint always requires a
 * valid public payout address (a `businesses` row cannot exist without one).
 */
export const createBusinessRequestSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the business name.").max(80),
  contactName: z.string().trim().min(2, "Enter the authorised contact's name.").max(80),
  contactChannelType: contactChannelTypeSchema,
  contactChannelValue: z.string().trim().min(3).max(120),
  category: businessCategorySchema,
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
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
export type CreateBusinessRequest = z.infer<typeof createBusinessRequestSchema>;

export async function createBusiness(
  db: Database,
  input: CreateBusinessRequest,
): Promise<BusinessRow> {
  const slug = slugify(input.businessName);
  if (!slug) {
    throw new HttpError(400, "INVALID_NAME", "Business name does not produce a usable slug.");
  }

  const existing = await findBusinessBySlug(db, slug);
  if (existing) {
    throw new HttpError(409, "BUSINESS_EXISTS", `A business with slug "${slug}" already exists.`);
  }

  const now = new Date();
  const business = await insertBusiness(db, {
    slug,
    name: input.businessName.trim(),
    contactName: input.contactName.trim(),
    contactChannelType: input.contactChannelType,
    contactChannelValue: input.contactChannelValue.trim(),
    category: input.category,
    city: input.city.trim(),
    country: input.country.trim(),
    payoutAddress: normalizeEvmAddress(input.payoutAddress),
    quoteCurrency: input.quoteCurrency,
    consentAt: input.consentToQuoteDisplay ? now : null,
    status: "PENDING_VERIFICATION",
  });

  await appendAuditEvent(db, {
    type: "business.created",
    businessId: business.id,
    data: { slug: business.slug, category: business.category, status: business.status },
  });

  return business;
}
