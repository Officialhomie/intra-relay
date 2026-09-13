import type { Database } from "@/lib/db/client";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";

import { manageTokenMatchesBusinessSlug } from "./access";
import { findBusinessBySlug, updateBusiness } from "./repository";
import { businessOnboardingObject } from "./schema";
import type { PublicBusiness } from "@/features/routes/reads";
import { toPublicBusiness } from "@/features/routes/reads";

/**
 * Merchant self-service for their own basic details (M10.2B).
 *
 * Deliberately four fields. This is not a merchant CRUD dashboard: everything
 * that carries an operational or commercial consequence — verification state,
 * business/route status, payout address, consent record, currency, category,
 * slug, manage token, pricing — stays where it already lives (operator review,
 * or the existing price-edit path). A merchant correcting a typo in their own
 * phone number should not be able to touch any of it.
 *
 * Validation is NOT re-specified here: each field reuses the exact rule from
 * `businessOnboardingObject`, so the message a merchant sees when correcting
 * their name is the message they saw when they first typed it.
 */

/**
 * The whitelist. `slug` is deliberately absent: it is the business's public
 * identity (`/supplier/<slug>`, `/v1/<slug>/capabilities`, and every route's
 * stored `endpoint`), so a display-name change renames what customers read,
 * never what the URLs resolve to.
 */
export const businessProfileSchema = businessOnboardingObject.pick({
  businessName: true,
  contactName: true,
  contactChannelValue: true,
  city: true,
});

export type BusinessProfileInput = typeof businessProfileSchema._output;

export interface UpdateBusinessProfileResult {
  business: PublicBusiness;
  /** Fields whose value actually changed — drives the audit entry. */
  changed: (keyof BusinessProfileInput)[];
}

/**
 * Apply a merchant's own edit, authorised by the manage token they present.
 *
 * The token is checked against THIS slug (`manageTokenMatchesBusinessSlug`,
 * constant-time), so one supplier's token can never authorise an edit to
 * another supplier's business — the business is resolved from the slug in the
 * URL, never from anything in the request body.
 */
export async function updateBusinessProfile(
  db: Database,
  slug: string,
  manageToken: string | null,
  input: BusinessProfileInput,
): Promise<UpdateBusinessProfileResult> {
  if (!(await manageTokenMatchesBusinessSlug(db, slug, manageToken))) {
    throw new HttpError(401, "MANAGE_TOKEN_REQUIRED", "This action needs your manage link.");
  }

  const business = await findBusinessBySlug(db, slug);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");

  // Built field by field from the parsed input — never spread from the request
  // body, so an unexpected key cannot reach the database even if one is sent.
  const patch = {
    name: input.businessName,
    contactName: input.contactName,
    contactChannelValue: input.contactChannelValue,
    city: input.city,
  };

  const changed = (
    [
      ["businessName", business.name, patch.name],
      ["contactName", business.contactName, patch.contactName],
      ["contactChannelValue", business.contactChannelValue, patch.contactChannelValue],
      ["city", business.city, patch.city],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field);

  if (changed.length === 0) {
    return { business: toPublicBusiness(business), changed: [] };
  }

  const updated = await updateBusiness(db, business.id, { ...patch, updatedAt: new Date() });

  await appendAuditEvent(db, {
    type: "business.profile_updated",
    businessId: business.id,
    // Which fields moved, never the values: a contact number is the merchant's
    // personal data and the audit trail is a wider-read surface than they are.
    data: { slug: business.slug, changed, by: "business:manage_token" },
  });

  return { business: toPublicBusiness(updated), changed };
}
