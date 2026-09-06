import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http/handler";
import { parseJsonBody } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { recordPilotEvent } from "@/features/analytics/pilot";
import { resolveRecipient } from "@/features/notifications/access";
import { setPreferences } from "@/features/notifications/preferences";
import { savePushSubscription } from "@/features/notifications/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  /** A coarse device label the person can recognise. No fingerprinting. */
  userAgent: z.string().trim().max(200).optional(),
});

/**
 * Register a browser push subscription for the CURRENT authenticated recipient
 * (milestone 7 §8, §9). The recipient is resolved server-side from the session
 * / manage token — a client-sent id is never trusted, so a subscription can
 * never be bound to another identity. Subscribing turns the push preference on;
 * a repeat call for the same endpoint just refreshes it.
 */
export const POST = route(async (request) => {
  const url = new URL(request.url);
  const db = await getDb();
  const { audience, recipientKey } = await resolveRecipient(db, request, url);
  const body = await parseJsonBody(request, bodySchema);

  await savePushSubscription(db, {
    audience,
    recipientKey,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: body.userAgent ?? null,
  });
  const preference = await setPreferences(db, audience, recipientKey, { pushEnabled: true });
  void recordPilotEvent(db, { name: "push_subscribed", actorKey: recipientKey });

  return ok({ subscribed: true, preference });
});
