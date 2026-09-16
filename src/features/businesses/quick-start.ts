import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { quoteRoutes, type BusinessRow, type QuoteRouteRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { slugify } from "@/lib/slug";
import { appendAuditEvent } from "@/features/audit/repository";
import { pricingModelSchema } from "@/features/pricing/model";
import { quoteCurrencySchema } from "@/features/routes/schema";
import { getTemplateForCategory } from "@/features/routes/templates";

import { manageLinkPath } from "./manage-link";
import { findBusinessBySlug, insertBusiness } from "./repository";
import { businessCategorySchema } from "./schema";

/**
 * Getting a business started in one screen (milestone 5 §4).
 *
 * The full onboarding asks sixteen questions before anything exists, and every
 * one of them is a chance to close the tab. This asks the five a business
 * cannot be set up without, creates the business AND its first service, and
 * leaves everything else — service area, opening hours, payouts, paid agent
 * queries — to be filled in later, from the business's own workspace.
 *
 * What it deliberately does NOT change: the route is created as DRAFT and an
 * operator still verifies before customers can reach it (BR-002, AC-SUP-003).
 * Faster setup must not mean an unchecked business going live.
 */

/**
 * The field list, exported separately so a safety test can introspect it with
 * `.shape` — the same pattern `businessOnboardingObject` uses. The parseable
 * schema is `quickStartSchema`, which adds the conditional price rule.
 */
export const quickStartObject = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter your business name.")
    .max(80, "That name is too long."),
  category: businessCategorySchema,
  /** What this business does, in its own words. Becomes the service name. */
  serviceName: z
    .string()
    .trim()
    .min(3, "Name the service, e.g. “Flyer printing”.")
    .max(80, "Keep the service name short."),
  pricingModel: pricingModelSchema,
  /** Required unless the business prices every job individually. */
  priceAmount: z.coerce.number().positive().max(1_000_000_000).nullable().optional(),
  priceUnit: z.string().trim().max(40).nullable().optional(),
  quoteCurrency: quoteCurrencySchema.default("NGN"),
  /** Where the business works, and how a customer reaches it. */
  serviceArea: z.string().trim().min(2, "Where do you work?").max(120),
  city: z.string().trim().min(2, "Enter your city.").max(80),
  country: z.string().trim().min(2).max(80).default("Nigeria"),
  contactName: z.string().trim().min(2, "Who should customers ask for?").max(80),
  contactChannelValue: z
    .string()
    .trim()
    .min(3, "Enter the WhatsApp number that receives orders.")
    .max(120),
  consentToQuoteDisplay: z.boolean().refine((value) => value === true, {
    message: "You need to agree before your prices can be shown to customers.",
  }),
});

export const quickStartSchema = quickStartObject.refine(
  (value) => value.pricingModel === "QUOTE_REQUIRED" || (value.priceAmount ?? 0) > 0,
  { path: ["priceAmount"], message: "Enter the amount customers should see." },
);
export type QuickStartInput = z.infer<typeof quickStartSchema>;

export interface QuickStartResult {
  business: BusinessRow;
  route: QuoteRouteRow;
  /** The private link the business uses to manage itself. Shown once. */
  manageUrl: string;
  /** What still has to happen before customers can reach them. */
  nextStep: string;
}

/**
 * A business with no payout address is fine — Intra only needs one when the
 * business wants to charge agents a fee to answer, which is not a day-one
 * decision. The column is not nullable, so an unset address is the zero
 * address, and `wantsPaidQueries` stays off until they set a real one.
 */
const NO_PAYOUT_ADDRESS = `0x${"0".repeat(40)}`;

export async function quickStartBusiness(
  db: Database,
  input: QuickStartInput,
): Promise<QuickStartResult> {
  const slug = slugify(input.businessName);
  if (!slug) {
    throw new HttpError(
      400,
      "INVALID_NAME",
      "That business name cannot be turned into a web address. Try adding a letter or two.",
    );
  }
  if (await findBusinessBySlug(db, slug)) {
    throw new HttpError(
      409,
      "BUSINESS_EXISTS",
      "A business with that name is already set up here.",
    );
  }

  const now = new Date();
  const business = await insertBusiness(db, {
    slug,
    name: input.businessName.trim(),
    contactName: input.contactName.trim(),
    contactChannelType: "whatsapp",
    contactChannelValue: input.contactChannelValue.trim(),
    category: input.category,
    city: input.city.trim(),
    country: input.country.trim(),
    // No paid agent queries on day one, so no payout address is collected.
    payoutAddress: NO_PAYOUT_ADDRESS,
    quoteCurrency: input.quoteCurrency,
    consentAt: now,
    status: "PENDING_VERIFICATION",
  });

  const template = getTemplateForCategory(input.category);
  const serviceSlug = slugify(input.serviceName) || template.id;
  const priced = input.pricingModel !== "QUOTE_REQUIRED" && input.priceAmount != null;

  const [route] = await db
    .insert(quoteRoutes)
    .values({
      businessId: business.id,
      slug: serviceSlug,
      name: input.serviceName.trim(),
      description: `${input.serviceName.trim()} in ${input.serviceArea.trim()}.`,
      // Promoted structurally too (M10.8), not just embedded in the
      // description string — the one fulfilment/location fact this shorter
      // form actually collects. Pickup/delivery/turnaround aren't asked here,
      // so they stay null (UNKNOWN), same as any other business until the
      // supplier or an operator sets them.
      serviceArea: input.serviceArea.trim(),
      inputSchema: [...template.inputFields],
      // Free to ask until the business decides otherwise.
      queryFeeUsd: "0.0000",
      responseSlaMinutes: template.responseSlaMinutes,
      quoteCurrency: input.quoteCurrency,
      pricingModel: input.pricingModel,
      priceAmount: priced ? input.priceAmount!.toFixed(2) : null,
      priceUnit: input.priceUnit?.trim() || null,
      payoutAddress: NO_PAYOUT_ADDRESS,
      endpoint: `/v1/${slug}/${serviceSlug}/quote`,
      status: "DRAFT",
    })
    .returning();

  await appendAuditEvent(db, {
    type: "business.quick_started",
    businessId: business.id,
    routeId: route.id,
    data: {
      slug: business.slug,
      category: business.category,
      serviceSlug: route.slug,
      pricingModel: route.pricingModel,
    },
  });

  return {
    business,
    route,
    manageUrl: manageLinkPath(slug, business.manageToken),
    nextStep:
      "An Intra operator checks your details before customers can reach you. You can add your opening hours, service area and payout details from your workspace in the meantime.",
  };
}

/**
 * Why a business would bother — shown inside the flow itself, not on a
 * marketing page (§8). Every line is something the product actually does; none
 * of them promises more customers.
 */
export const WHY_BUSINESSES_JOIN: readonly { title: string; body: string }[] = [
  {
    title: "Requests arrive already specific",
    body: "Customers describe the job once, and it reaches you as a structured request — quantity, deadline, and where it needs to go.",
  },
  {
    title: "You set the price, every time",
    body: "Publish a price, a starting figure, or nothing at all. Whatever you quote for a job is the amount that counts.",
  },
  {
    title: "An agreed price stays agreed",
    body: "Once a customer accepts your quote, it cannot change underneath them — and if you need a different price, they have to agree to it first.",
  },
  {
    title: "Completed jobs build a record",
    body: "Jobs both sides confirm add to a history attached to your business. It is a record of what happened, not a rating.",
  },
] as const;
