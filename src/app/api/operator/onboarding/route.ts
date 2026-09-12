import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { ok } from "@/lib/http/response";
import { listOnboardingSubmissions } from "@/features/onboarding/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator view of remote (Tally) onboarding submissions (M10.1 §11).
 *
 * `PROCESSED` submissions already have a real business/route, visible
 * through the existing `/operator` review queue — this view exists mainly
 * for `NEEDS_REVIEW` submissions, which create nothing and so have no other
 * home for an operator to see what needs fixing, without re-opening Tally.
 */
export const GET = route(async (request) => {
  requireOperator(request);
  const db = await getDb();
  const submissions = await listOnboardingSubmissions(db);
  return ok({
    submissions: submissions.map((s) => ({
      id: s.id,
      status: s.status,
      tallySubmissionId: s.tallySubmissionId,
      tallySubmissionPreviewUrl: s.tallySubmissionPreviewUrl,
      normalizedData: s.normalizedData,
      issues: s.issues ?? [],
      businessId: s.businessId,
      routeId: s.routeId,
      receivedAt: s.receivedAt.toISOString(),
      processedAt: s.processedAt?.toISOString() ?? null,
    })),
  });
});
