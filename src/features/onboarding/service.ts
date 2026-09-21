import type { Database } from "@/lib/db/client";
import type { BusinessRow, QuoteRouteRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { normalizeEvmAddress, EVM_ADDRESS_REGEX } from "@/lib/address";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import { insertBusiness, findBusinessById } from "@/features/businesses/repository";
import { applyPrintingRouteFacts } from "@/features/routes/printing-capability";
import { createRoute } from "@/features/routes/service";
import { findRouteById } from "@/features/routes/repository";
import { forwardServerAnalyticsEvent } from "@/features/analytics/server";

import { normalizeTallySubmission, type NormalizedOnboarding } from "./normalize";
import {
  mapMinimumOrders,
  mapServicesToProductTypes,
  resolvePricingModel,
} from "./printing-mapping";
import { insertOrGetOnboardingSubmission, updateOnboardingSubmission } from "./repository";
import type { TallyWebhookPayload } from "./tally-schema";
import { validateNormalizedOnboarding } from "./validate";
import type { OnboardingIssue } from "./status";

/**
 * The deterministic Tally -> Intra onboarding pipeline (M10.1, ADR-024).
 *
 * `createBusiness`'s own public schema requires a real payout address (its
 * own comment says so explicitly) — correct for the human-facing forms it
 * serves, but this pipeline must accept a business with no wallet yet and
 * mark it not payment-ready (§8), the same thing `quickStartBusiness` already
 * does. So business creation here calls `insertBusiness` directly, using the
 * SAME zero-address sentinel (`OFF_CHAIN_ASSET`) and the SAME `PENDING_VERIFICATION`
 * status `createBusiness` uses for a fully-specified application — never a
 * fabricated non-zero address, and never `businesses.status = ACTIVE` (only
 * an operator activating a route can make anything buyer-facing).
 */

export interface ProcessTallySubmissionResult {
  status: "RECEIVED" | "NEEDS_REVIEW" | "PROCESSED" | "REPLAYED";
  submissionId: string;
  business: BusinessRow | null;
  route: QuoteRouteRow | null;
  issues: OnboardingIssue[];
}

async function createBusinessFromOnboarding(
  db: Database,
  data: NormalizedOnboarding,
  slug: string,
): Promise<BusinessRow> {
  const now = new Date();
  const hasRealAddress =
    data.hasWallet === true &&
    !!data.payoutAddress &&
    EVM_ADDRESS_REGEX.test(data.payoutAddress) &&
    normalizeEvmAddress(data.payoutAddress) !== OFF_CHAIN_ASSET;

  const business = await insertBusiness(db, {
    slug,
    name: data.businessName!.trim(),
    contactName: data.ownerContactName!.trim(),
    contactChannelType: "whatsapp",
    contactChannelValue: data.whatsappNumber!.trim(),
    // Not a limitation to remove — the Tally form itself is printing-only
    // (M10.3/M10.6 audit) and asks nothing that could tell us a different
    // category, so there is no "correct" value to derive here. This stays a
    // literal until a form for another category exists to derive it from.
    category: "printing",
    city: data.city!.trim(),
    country: "Nigeria",
    payoutAddress: hasRealAddress ? normalizeEvmAddress(data.payoutAddress!) : OFF_CHAIN_ASSET,
    quoteCurrency: "NGN",
    consentAt: now,
    status: "PENDING_VERIFICATION",
  });

  await appendAuditEvent(db, {
    type: "business.created",
    businessId: business.id,
    data: {
      slug: business.slug,
      category: business.category,
      status: business.status,
      source: "tally",
    },
  });

  return business;
}

/**
 * Fold the submitted printing services into the route this business just got
 * (M10.6, items 6–8). The route stays the single, existing `flyer-printing`
 * template/slug — still one parameterised printing route, never one per
 * product, and still discoverable exactly the way it always was. This only
 * enriches what it declares it can take:
 *
 * - `productType` is added to the route's declarative `inputSchema` with
 *   `options` set to the business's own submitted product types — the
 *   existing generic descriptor already round-trips an `options` array
 *   (`routes/schema.ts`), and the actual buyer-facing validator
 *   (`flyerPrintingInputSchema`) already accepts `productType` as optional
 *   (M10.6), so this is never a decorative field an agent could be misled by.
 * - `pricingModel` is set to the one the business actually stated, when every
 *   submitted service agreed on it; otherwise it stays the conservative
 *   `QUOTE_REQUIRED` and the disagreement is flagged as a warning for an
 *   operator — never a guess at which price was the "real" one.
 * - A service label that is not one of the 14 known products (the free-text
 *   "Other" answer) is never silently dropped: it is excluded from
 *   `productType`'s options and flagged as a warning, exactly like an
 *   ambiguous price already was before this milestone.
 * - `serviceArea`, `pickupAvailable`, `deliveryAvailable`, and `turnaround`
 *   (M10.8) are promoted onto the route as-is — a direct passthrough of what
 *   `normalize.ts` already read from Tally, never re-derived or guessed. Each
 *   is `null` when the business never answered that question (Tally's own
 *   boolean questions already normalize a missing/unrecognized answer to
 *   `null`, not `false` — see `normalize.ts`'s `pickupText ? ... : null`), and
 *   that `null` is promoted unchanged so a missing answer reads as UNKNOWN,
 *   never as a fabricated "no" (M10.7 §2, §9; M10.8 Part E). This is what
 *   stops the M10.3 G4 data loss: previously these four answers survived only
 *   inside `onboarding_submissions.normalizedData` jsonb and nothing else ever
 *   read them.
 *
 * The route is still `DRAFT`; nothing here touches activation.
 */
async function enrichPrintingRoute(
  db: Database,
  route: QuoteRouteRow,
  data: NormalizedOnboarding,
): Promise<{ route: QuoteRouteRow; issues: OnboardingIssue[] }> {
  const issues: OnboardingIssue[] = [];

  const { productTypes, unmapped } = mapServicesToProductTypes(data.services);
  const minimumOrders = mapMinimumOrders(data.services);
  if (unmapped.length > 0) {
    issues.push({
      field: "services",
      message: `${unmapped.length === 1 ? "This service was" : "These services were"} not recognised as a supported printing product and need an operator to place ${unmapped.length === 1 ? "it" : "them"}: ${unmapped.join(", ")}.`,
    });
  }

  const { model: pricingModel, mixed } = resolvePricingModel(data.services);
  if (mixed) {
    issues.push({
      field: "services",
      message:
        'The submitted services use different pricing models, so the route was set to "priced per job" rather than guessing one. An operator should review the individual prices in the submission.',
    });
  }

  const updated = await applyPrintingRouteFacts(db, route, {
    productTypes,
    pricingModel,
    serviceArea: data.serviceArea,
    city: data.city,
    pickupAvailable: data.pickupAvailable,
    deliveryAvailable: data.deliveryAvailable,
    turnaround: data.turnaround,
    minimumOrders: Object.keys(minimumOrders).length > 0 ? minimumOrders : null,
  });
  return { route: updated, issues };
}

/**
 * Handle one verified, shape-valid Tally webhook delivery end to end.
 *
 * Idempotent on `tallySubmissionId` (a re-delivered webhook returns the
 * result of the first successful processing, never creates a second
 * business). Never throws for a data problem — a bad or incomplete
 * submission becomes `NEEDS_REVIEW`, not an error response, so Tally does not
 * retry-storm a submission that will never validate.
 */
export async function processTallySubmission(
  db: Database,
  payload: TallyWebhookPayload,
  expectedFormId: string,
): Promise<ProcessTallySubmissionResult> {
  if (payload.data.formId !== expectedFormId) {
    throw new HttpError(400, "UNKNOWN_FORM_ID", "This webhook is not for the onboarding form.");
  }

  const { row: submission, created } = await insertOrGetOnboardingSubmission(db, {
    tallyFormId: payload.data.formId,
    tallySubmissionId: payload.data.submissionId,
    tallyEventId: payload.eventId,
    tallySubmissionPreviewUrl: payload.data.submissionPreviewUrl ?? null,
    status: "RECEIVED",
    normalizedData: {},
  });

  if (!created) {
    const business = submission.businessId
      ? await findBusinessById(db, submission.businessId)
      : null;
    const route = submission.routeId ? await findRouteById(db, submission.routeId) : null;
    return {
      status: "REPLAYED",
      submissionId: submission.id,
      business,
      route,
      issues: submission.issues ?? [],
    };
  }

  forwardServerAnalyticsEvent({
    event: "onboarding_received",
    actorKey: submission.id,
    role: "business",
    props: {},
    insertId: `onboarding_received:${submission.id}`,
  });

  const { data, issues: normalizationIssues } = normalizeTallySubmission(payload);
  const { blockingIssues, warnings, possibleDuplicate, slug } = await validateNormalizedOnboarding(
    db,
    data,
    normalizationIssues,
  );
  const allIssues = [...blockingIssues, ...warnings];

  if (blockingIssues.length > 0) {
    await updateOnboardingSubmission(db, submission.id, {
      normalizedData: data,
      issues: allIssues,
      status: "NEEDS_REVIEW",
      processedAt: new Date(),
    });
    await appendAuditEvent(db, {
      type: "onboarding.needs_review",
      data: {
        submissionId: submission.id,
        issues: blockingIssues,
        possibleDuplicateBusinessId: possibleDuplicate?.businessId ?? null,
      },
    });
    forwardServerAnalyticsEvent({
      event: "onboarding_needs_review",
      actorKey: submission.id,
      role: "business",
      props: { issue_count: blockingIssues.length },
      insertId: `onboarding_needs_review:${submission.id}`,
    });
    return {
      status: "NEEDS_REVIEW",
      submissionId: submission.id,
      business: null,
      route: null,
      issues: allIssues,
    };
  }

  forwardServerAnalyticsEvent({
    event: "onboarding_validated",
    actorKey: submission.id,
    role: "business",
    props: { service_count: data.services.length, warning_count: warnings.length },
    insertId: `onboarding_validated:${submission.id}`,
  });

  const business = await createBusinessFromOnboarding(db, data, slug!);
  // Printing is the only live category template today (M10.1/M10.3 audit) —
  // the route resolves to it via the business's own category, never
  // hardcoded here. The route is then enriched with the actual submitted
  // product types and pricing (M10.6) — still the same single route.
  const draftRoute = await createRoute(db, business.slug, {});
  const { route, issues: enrichmentIssues } = await enrichPrintingRoute(db, draftRoute, data);
  const finalIssues = [...allIssues, ...enrichmentIssues];

  await updateOnboardingSubmission(db, submission.id, {
    normalizedData: data,
    issues: finalIssues.length > 0 ? finalIssues : null,
    status: "PROCESSED",
    businessId: business.id,
    routeId: route.id,
    processedAt: new Date(),
  });

  await appendAuditEvent(db, {
    type: "onboarding.created",
    businessId: business.id,
    routeId: route.id,
    data: { submissionId: submission.id, warningCount: warnings.length + enrichmentIssues.length },
  });
  forwardServerAnalyticsEvent({
    event: "onboarding_created",
    actorKey: submission.id,
    role: "business",
    props: { warning_count: warnings.length + enrichmentIssues.length },
    insertId: `onboarding_created:${submission.id}`,
  });

  return { status: "PROCESSED", submissionId: submission.id, business, route, issues: finalIssues };
}
