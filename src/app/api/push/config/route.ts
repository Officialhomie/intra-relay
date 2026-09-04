import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { resolveRecipient } from "@/features/notifications/access";
import { getPreferences } from "@/features/notifications/preferences";
import { isPushConfigured, publicVapidKey } from "@/features/notifications/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the client needs to set up push: the public VAPID key (runtime, not
 * build-inlined, so it survives an env change without a rebuild), whether the
 * server can send at all, and this recipient's current preference.
 *
 * Auth is best-effort — an anonymous caller still gets the key + configured
 * flag, just no `preference`.
 */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const base = { vapidPublicKey: publicVapidKey(), configured: isPushConfigured() };
  try {
    const db = await getDb();
    const { audience, recipientKey } = await resolveRecipient(db, request, url);
    const preference = await getPreferences(db, audience, recipientKey);
    return ok({ ...base, preference });
  } catch {
    return ok({ ...base, preference: null });
  }
});
