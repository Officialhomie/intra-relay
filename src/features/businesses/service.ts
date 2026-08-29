import { z } from "zod";

import type { Database } from "@/lib/db/client";
import type { BusinessRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { normalizeEvmAddress } from "@/lib/address";
import { slugify } from "@/lib/slug";
import { appendAuditEvent } from "@/features/audit/repository";

import { findBusinessBySlug, insertBusiness } from "./repository";
import { businessOnboardingSchema } from "./schema";

/**
 * `POST /api/businesses` payload (FR-SUP-001, FR-SUP-002).
 * Reuses the shared onboarding schema; no field for prohibited data (FR-SUP-003).
 */
export const createBusinessRequestSchema = businessOnboardingSchema;
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
