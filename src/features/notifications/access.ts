import type { Database } from "@/lib/db/client";
import { HttpError } from "@/lib/http/response";
import { requireSessionId } from "@/lib/http/request";
import { manageTokenMatchesBusinessSlug } from "@/features/businesses/access";
import { findBusinessBySlug } from "@/features/businesses/repository";

import type { NotificationAudience } from "./attention";

/**
 * Who is asking for their notifications, resolved and verified server-side
 * (milestone 7 §23). A notification id is never an authorisation mechanism —
 * every read and write is scoped to (audience, recipientKey), and this is where
 * that key is established from real credentials:
 *
 *   buyer     an `x-session-id` header / query param
 *   business  `?businessSlug=` plus a matching `?t=` manage token
 */
export interface NotificationRecipient {
  audience: NotificationAudience;
  recipientKey: string;
}

export async function resolveRecipient(
  db: Database,
  request: Request,
  url: URL,
): Promise<NotificationRecipient> {
  const businessSlug = url.searchParams.get("businessSlug");
  if (businessSlug) {
    const token = url.searchParams.get("t") ?? request.headers.get("x-manage-token");
    const ok = await manageTokenMatchesBusinessSlug(db, businessSlug, token);
    if (!ok) {
      throw new HttpError(401, "SUPPLIER_AUTH_REQUIRED", "That business manage link is not valid.");
    }
    const business = await findBusinessBySlug(db, businessSlug);
    if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "No business with that name.");
    return { audience: "BUSINESS", recipientKey: business.id };
  }

  const sessionId = requireSessionId(request, url);
  return { audience: "BUYER", recipientKey: sessionId };
}
