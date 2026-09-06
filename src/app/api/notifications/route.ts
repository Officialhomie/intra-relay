import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { resolveRecipient } from "@/features/notifications/access";
import { getActionCentre } from "@/features/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The action centre for whoever is asking (milestone 7 §3, §14). Split into
 * "needs your attention" and "updates", with an unread count. The recipient is
 * resolved from real credentials — the response only ever contains that
 * recipient's own notifications.
 */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  return ok(await getActionCentre(db, audience, recipientKey));
});
