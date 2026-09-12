import type { Database } from "@/lib/db/client";
import { EVM_ADDRESS_REGEX, normalizeEvmAddress } from "@/lib/address";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import {
  findBusinessByContactChannelValue,
  findBusinessBySlug,
} from "@/features/businesses/repository";
import { slugify } from "@/lib/slug";

import type { NormalizedOnboarding } from "./normalize";
import type { OnboardingIssue } from "./status";

/**
 * Whether a normalized submission is complete and safe enough to create a
 * real (`DRAFT`) business from (M10.1 §9). Never silently repairs a
 * commercially meaningful answer.
 *
 * Two severities, both surfaced to the operator, only one of them blocking:
 *
 * - `blockingIssues` — missing identity/contact/location, zero services,
 *   no consent, an unrecognized pricing model, or an invalid/placeholder
 *   payout address. Creating a business would mean inventing data Intra was
 *   never actually given, so none of this creates anything — `NEEDS_REVIEW`.
 * - `warnings` — e.g. a service is priced FIXED/STARTING_FROM but the price
 *   text is empty. The business and its one route are still created (§5) —
 *   the route is `DRAFT` and cannot be quoted to a buyer until an operator
 *   activates it (`FR-ROUTE-004`), and setting the *real*, structured price
 *   is already that operator's existing job (`EditPublishedPriceForm` /
 *   `PATCH /api/routes/[id]/pricing`) before activation, never guessed here
 *   (§7 — this module never parses free text like "₦5,000 per 100" into a
 *   number; there is no established safe parser for it in this app).
 */
export interface ValidationResult {
  blockingIssues: OnboardingIssue[];
  warnings: OnboardingIssue[];
  possibleDuplicate: { businessId: string; reason: string } | null;
  /** Slug the business would get, for the duplicate check and later creation. */
  slug: string | null;
}

function isMissing(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

export async function validateNormalizedOnboarding(
  db: Database,
  data: NormalizedOnboarding,
  normalizationIssues: OnboardingIssue[],
): Promise<ValidationResult> {
  const blockingIssues: OnboardingIssue[] = [];
  const warnings: OnboardingIssue[] = [...normalizationIssues];

  if (isMissing(data.businessName))
    blockingIssues.push({ field: "businessName", message: "Missing business name." });
  if (isMissing(data.ownerContactName))
    blockingIssues.push({ field: "ownerContactName", message: "Missing contact name." });
  if (isMissing(data.whatsappNumber))
    blockingIssues.push({ field: "whatsappNumber", message: "Missing WhatsApp number." });
  if (isMissing(data.city)) blockingIssues.push({ field: "city", message: "Missing city." });
  if (isMissing(data.serviceArea))
    blockingIssues.push({ field: "serviceArea", message: "Missing service area." });
  if (!data.consentGiven)
    blockingIssues.push({ field: "consentGiven", message: "Consent was not given." });

  if (data.services.length === 0) {
    blockingIssues.push({ field: "services", message: "No services were selected." });
  }
  for (const service of data.services) {
    if (!service.pricingModel) {
      blockingIssues.push({
        field: `services.${service.label}.pricingModel`,
        message: `${service.label} has no recognized pricing model.`,
      });
      continue;
    }
    if (service.pricingModel !== "QUOTE_REQUIRED" && isMissing(service.priceText)) {
      warnings.push({
        field: `services.${service.label}.priceText`,
        message: `${service.label} is priced as ${service.pricingModel} but no price was given — an operator must set the real price before this route can go live.`,
      });
    }
  }

  let slug: string | null = null;
  let possibleDuplicate: ValidationResult["possibleDuplicate"] = null;
  if (!isMissing(data.businessName)) {
    slug = slugify(data.businessName!) || null;
    if (!slug) {
      blockingIssues.push({
        field: "businessName",
        message: "Business name does not produce a usable slug.",
      });
    } else {
      const existingBySlug = await findBusinessBySlug(db, slug);
      if (existingBySlug) {
        possibleDuplicate = { businessId: existingBySlug.id, reason: "Same business name" };
      }
    }
  }
  if (!possibleDuplicate && !isMissing(data.whatsappNumber)) {
    const existingByContact = await findBusinessByContactChannelValue(
      db,
      data.whatsappNumber!.trim(),
    );
    if (existingByContact) {
      possibleDuplicate = { businessId: existingByContact.id, reason: "Same WhatsApp number" };
    }
  }
  if (possibleDuplicate) {
    // A likely duplicate always needs a human decision — never silently
    // create a second business, and never silently merge into the existing one.
    blockingIssues.push({
      field: "businessName",
      message: `Looks like a duplicate of an existing business (${possibleDuplicate.reason}).`,
    });
  }

  if (data.hasWallet) {
    const address = data.payoutAddress?.trim();
    if (isMissing(address)) {
      blockingIssues.push({
        field: "payoutAddress",
        message: "Said they have a wallet address but did not provide one.",
      });
    } else if (!EVM_ADDRESS_REGEX.test(address!)) {
      blockingIssues.push({
        field: "payoutAddress",
        message: "Wallet address is not a valid public EVM/Celo address.",
      });
    } else if (normalizeEvmAddress(address!) === OFF_CHAIN_ASSET) {
      // Never treated as "no wallet" — an explicit zero address is a data
      // problem to review, not a silent downgrade (M10.5's own fund-loss fix).
      blockingIssues.push({
        field: "payoutAddress",
        message: "Wallet address cannot be the zero address.",
      });
    }
  }

  return { blockingIssues, warnings, possibleDuplicate, slug };
}
