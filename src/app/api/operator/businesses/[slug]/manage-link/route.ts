import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { requireOperator } from "@/lib/http/operator";
import { HttpError, ok } from "@/lib/http/response";
import { appendAuditEvent } from "@/features/audit/repository";
import { findBusinessBySlug } from "@/features/businesses/repository";
import { manageLinkMessage, manageLinkUrl } from "@/features/businesses/manage-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recover one merchant's manage link (M10.2A).
 *
 * A merchant who has lost their link has no other way back in: the token is
 * their only credential, notifications are gated behind the very link they
 * lost, and no other read returns it (`toPublicBusiness` strips it everywhere).
 * This is the one deliberate exception, and it is narrow on purpose:
 *
 *   - operator-key gated, like every other `/api/operator/*` surface;
 *   - ONE named business per call — a token never rides along in a list
 *     response, so a broad read can never leak one by accident;
 *   - every retrieval is recorded in the append-only audit trail, because
 *     handing out a live credential is an act worth being able to review.
 *
 * The operator sends the link on to the merchant themselves (their own
 * WhatsApp). Intra has no outbound messaging integration and this does not
 * add one.
 */
export const GET = route(async (request, context) => {
  const operator = requireOperator(request);
  const { slug } = await context.params;

  const db = await getDb();
  const business = await findBusinessBySlug(db, slug);
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that slug.");

  const url = manageLinkUrl(business.slug, business.manageToken);

  await appendAuditEvent(db, {
    type: "business.manage_link_recovered",
    businessId: business.id,
    // The token itself is never written to the audit trail — only the fact
    // that an operator retrieved it, and who.
    data: { slug: business.slug, by: `operator:${operator.label}` },
  });

  return ok({
    business: { slug: business.slug, name: business.name },
    manageUrl: url,
    /** Ready to paste into WhatsApp — plain language, no jargon. */
    message: manageLinkMessage(business.name, url),
  });
});
