import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { resolveRecipient } from "@/features/notifications/access";
import { setPreferences } from "@/features/notifications/preferences";
import {
  deletePushSubscriptionForRecipient,
  listPushSubscriptions,
} from "@/features/notifications/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ endpoint: z.string().url().max(2000) });

/**
 * Drop this device's push subscription (milestone 7 §8 — unsubscribe / logout /
 * account switch). Scoped to the current recipient so one person cannot delete
 * another's. When the last device goes, the push preference is turned off too.
 */
export const POST = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  const body = await parseJsonBody(request, bodySchema);

  await deletePushSubscriptionForRecipient(db, audience, recipientKey, body.endpoint);
  const remaining = await listPushSubscriptions(db, audience, recipientKey);
  if (remaining.length === 0) {
    await setPreferences(db, audience, recipientKey, { pushEnabled: false });
  }
  return ok({ unsubscribed: true });
});
