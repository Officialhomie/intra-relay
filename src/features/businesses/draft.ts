import { normalizeEvmAddress } from "@/lib/address";
import { slugify } from "@/lib/slug";
import { getTemplateForCategory } from "@/features/routes/templates";
import type { QuoteRoute } from "@/features/routes/schema";
import type { Business, BusinessOnboardingInput } from "./schema";

/**
 * Turn validated onboarding input into a reviewable DRAFT (FR-SUP-004, AC-SUP-002).
 *
 * Nothing is persisted. The route is `DRAFT`, never `ACTIVE`: a route becomes
 * public only after operator verification of consent and details
 * (AC-SUP-003, BR-002). No payment request is possible from a draft (FR-ROUTE-004).
 */

export interface OnboardingDraft {
  /** Storage mode for the caller/UI to label honestly. */
  persistence: "none";
  business: Business;
  route: QuoteRoute;
  /** PRD S-005 review screen for this draft. */
  draftRouteUrl: string;
  generatedAt: string;
}

export function buildOnboardingDraft(input: BusinessOnboardingInput): OnboardingDraft {
  const slug = slugify(input.businessName);
  const payoutAddress = normalizeEvmAddress(input.payoutAddress);
  const generatedAt = new Date().toISOString();

  const business: Business = {
    slug,
    name: input.businessName.trim(),
    contactName: input.contactName.trim(),
    contactChannel: {
      type: input.contactChannelType,
      value: input.contactChannelValue.trim(),
    },
    category: input.category,
    location: { city: input.city.trim(), country: input.country.trim() },
    payoutAddress,
    quoteCurrency: input.quoteCurrency,
    // Consent captured in-session only; it is recorded for real at operator
    // verification, not here.
    consentAt: input.consentToQuoteDisplay ? generatedAt : null,
    status: "DRAFT",
  };

  const template = getTemplateForCategory(input.category);
  const route: QuoteRoute = {
    name: template.name,
    slug: template.id,
    description: template.description,
    businessSlug: slug,
    inputFields: [...template.inputFields],
    queryFeeUsd: template.queryFeeUsd,
    responseSlaMinutes: template.responseSlaMinutes,
    quoteCurrency: input.quoteCurrency,
    payoutAddress,
    endpoint: `/v1/${slug}/${template.id}/quote`,
    status: "DRAFT",
  };

  return {
    persistence: "none",
    business,
    route,
    draftRouteUrl: `/supplier/${slug}/review`,
    generatedAt,
  };
}
