import type { Database } from "@/lib/db/client";
import type { BusinessRow, QuoteRouteRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { normalizeEvmAddress, EVM_ADDRESS_REGEX } from "@/lib/address";
import { OFF_CHAIN_ASSET } from "@/features/commitments/status";
import { insertBusiness, findBusinessById } from "@/features/businesses/repository";
import { createRoute } from "@/features/routes/service";
import { findRouteById } from "@/features/routes/repository";
import { forwardServerAnalyticsEvent } from "@/features/analytics/server";

import { normalizeTallySubmission, type NormalizedOnboarding } from "./normalize";
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
  // Printing is the only live category template today (M10.1 audit) — the
  // route resolves to it via the business's own category, never hardcoded here.
  const route = await createRoute(db, business.slug, {});

  await updateOnboardingSubmission(db, submission.id, {
    normalizedData: data,
    issues: allIssues.length > 0 ? allIssues : null,
    status: "PROCESSED",
    businessId: business.id,
    routeId: route.id,
    processedAt: new Date(),
  });

  await appendAuditEvent(db, {
    type: "onboarding.created",
    businessId: business.id,
    routeId: route.id,
    data: { submissionId: submission.id, warningCount: warnings.length },
  });
  forwardServerAnalyticsEvent({
    event: "onboarding_created",
    actorKey: submission.id,
    role: "business",
    props: { warning_count: warnings.length },
    insertId: `onboarding_created:${submission.id}`,
  });

  return { status: "PROCESSED", submissionId: submission.id, business, route, issues: allIssues };
}
