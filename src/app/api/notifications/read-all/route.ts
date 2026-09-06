import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { resolveRecipient } from "@/features/notifications/access";
import { markAllNotificationsRead } from "@/features/notifications/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clear the unread count for the caller. Reading is not taking the action (§18). */
export const POST = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  const cleared = await markAllNotificationsRead(db, audience, recipientKey);
  return ok({ cleared });
});
