import { normalizeEvmAddress } from "@/lib/address";
import { slugify } from "@/lib/slug";
import { getTemplateForCategory } from "@/features/routes/templates";
import type { QuoteRoute } from "@/features/routes/schema";

import {
  QUOTE_RESPONSE_TIME_LABELS,
  QUOTE_RESPONSE_TIME_MINUTES,
  type Business,
  type BusinessOnboardingInput,
} from "./schema";

/**
 * Turn validated onboarding input into a reviewable DRAFT (FR-SUP-004, AC-SUP-002).
 *
 * Nothing is persisted. The route is `DRAFT`, never `ACTIVE`: a route becomes
 * public only after operator verification of consent and details
 * (AC-SUP-003, BR-002). No payment request is possible from a draft (FR-ROUTE-004).
 */

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "email",
  phone: "phone",
};

/** Plain-language Capability Card the merchant reviews before submission. */
export interface CapabilityCardPreview {
  serviceName: string;
  whatItDoes: string;
  agentMustProvide: { label: string; example: string; required: boolean }[];
  serviceArea: string;
  operatingHours: string;
  turnaround: string;
  quoteResponseExpectation: string;
  queryFee: { paid: boolean; amountUsd: number; note: string };
  quoteCurrency: string;
  /** What becomes visible to any AI agent once an operator activates the route. */
  publicToAgents: string[];
  /** What stays private. */
  notPublic: string[];
}

export interface OnboardingDraft {
  /** Storage mode for the caller/UI to label honestly. */
  persistence: "none";
  business: Business;
  route: QuoteRoute;
  card: CapabilityCardPreview;
  /** PRD S-005 review screen for this draft (live only after an operator creates it). */
  draftRouteUrl: string;
  generatedAt: string;
}

export function buildOnboardingDraft(input: BusinessOnboardingInput): OnboardingDraft {
  const slug = slugify(input.businessName);
  const generatedAt = new Date().toISOString();
  const paid = input.wantsPaidQueries;
  const payoutAddress = paid ? normalizeEvmAddress(input.payoutAddress) : null;
  const channelLabel = CHANNEL_LABEL[input.contactChannelType] ?? input.contactChannelType;
  const responseSlaMinutes = QUOTE_RESPONSE_TIME_MINUTES[input.quoteResponseTime];
  const responseExpectation = QUOTE_RESPONSE_TIME_LABELS[input.quoteResponseTime];

  const template = getTemplateForCategory(input.category);
  const queryFeeUsd = paid ? template.queryFeeUsd : 0;

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
    serviceSummary: input.serviceSummary.trim(),
    serviceArea: input.serviceArea.trim(),
    operatingHours: input.operatingHours.trim(),
    turnaround: input.turnaround.trim(),
    quoteResponseTime: input.quoteResponseTime,
    payoutAddress,
    quoteCurrency: input.quoteCurrency,
    // Consent captured in-session only; recorded for real at operator verification.
    consentAt: input.consentToQuoteDisplay ? generatedAt : null,
    status: "DRAFT",
  };

  const route: QuoteRoute = {
    name: template.name,
    slug: template.id,
    description: input.serviceSummary.trim(),
    businessSlug: slug,
    inputFields: [...template.inputFields],
    queryFeeUsd,
    responseSlaMinutes,
    quoteCurrency: input.quoteCurrency,
    payoutAddress,
    endpoint: `/v1/${slug}/${template.id}/quote`,
    status: "DRAFT",
  };

  const card: CapabilityCardPreview = {
    serviceName: template.name,
    whatItDoes: input.serviceSummary.trim(),
    agentMustProvide: template.inputFields.map((field) => ({
      label: field.label,
      example: field.example,
      required: field.required,
    })),
    serviceArea: input.serviceArea.trim(),
    operatingHours: input.operatingHours.trim(),
    turnaround: input.turnaround.trim(),
    quoteResponseExpectation: responseExpectation,
    queryFee: {
      paid,
      amountUsd: queryFeeUsd,
      note: paid
        ? `An AI agent pays about $${queryFeeUsd.toFixed(2)} to request a quote. This is separate from what a customer pays you for the job.`
        : "Agents request a quote for free. You can add a small query fee later with your operator.",
    },
    quoteCurrency: input.quoteCurrency,
    publicToAgents: [
      `Your business name, category, and location (${business.location.city}, ${business.location.country})`,
      `This service, what it does, and the details an agent must send for a quote`,
      `Your service area, opening hours, typical turnaround, and quote response time (${responseExpectation})`,
      paid
        ? `A query fee of about $${queryFeeUsd.toFixed(2)} per request and your public payout address`
        : "That this route has no query fee",
      `Only after an operator activates the route: your ${channelLabel} order contact, so a human buyer can send you the final order`,
    ],
    notPublic: [
      `The name of your authorised contact (${business.contactName}) is never shown to agents`,
      `Your ${channelLabel} order contact stays hidden until the route is ACTIVE, verified, and fresh`,
      "Nothing about a customer's payment — customers always pay you directly",
    ],
  };

  return {
    persistence: "none",
    business,
    route,
    card,
    draftRouteUrl: `/supplier/${slug}/review`,
    generatedAt,
  };
}
