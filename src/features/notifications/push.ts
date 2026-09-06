import webpush from "web-push";

import type { Database } from "@/lib/db/client";
import type { NotificationRow } from "@/lib/db/schema";

import { forwardServerAnalyticsEvent } from "@/features/analytics/server";

import type { AttentionLevel } from "./attention";
import { getPreferences } from "./preferences";
import { markNotificationPushed } from "./repository";
import { deletePushSubscription, listPushSubscriptions, recordPushFailure } from "./repository";

/**
 * Web push delivery (milestone 7 phase C §6–§18).
 *
 * Push is an *attention mechanism, never a workflow dependency* (§17): every
 * function here swallows its own errors, so a slow or broken push service can
 * never fail — or roll back — the domain action that triggered the notification.
 * The in-app notification row is always written regardless.
 *
 * Payloads carry only what the catalogue already put on the row: a title, a
 * short body, and the in-app deep link. No id, amount, address, code or secret
 * (§11, §18). The linked page loads protected detail after the person is
 * authorised server-side.
 */

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );
}

/** The public key the browser needs to create a subscription. */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

function ensureConfigured(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

/**
 * Which levels warrant an OS/browser push, given the recipient's preferences
 * (§15, §16). Action-required and time-sensitive always push while push is on;
 * the quieter levels only if the person opted in.
 */
function shouldPush(level: AttentionLevel, pushInformational: boolean): boolean {
  if (level === "ACTION_REQUIRED" || level === "TIME_SENSITIVE") return true;
  return pushInformational;
}

interface SafePayload {
  title: string;
  body: string;
  url: string;
  /** Collapses repeat OS notifications about the same attention item (§34, §35). */
  tag: string;
}

function payloadFor(n: NotificationRow): SafePayload {
  return { title: n.title, body: n.body, url: n.deeplink, tag: n.dedupeKey };
}

/**
 * Deliver one notification to the recipient's push subscriptions. Safe to call
 * fire-and-forget. Returns the number of endpoints it reached (0 when push is
 * off, unconfigured, or nothing is subscribed).
 */
export async function deliverPush(db: Database, notification: NotificationRow): Promise<number> {
  try {
    if (!ensureConfigured()) return 0;

    const prefs = await getPreferences(db, notification.audience, notification.recipientKey);
    if (!prefs.pushEnabled) return 0;
    if (!shouldPush(notification.level, prefs.pushInformational)) return 0;

    const subs = await listPushSubscriptions(db, notification.audience, notification.recipientKey);
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payloadFor(notification));
    let delivered = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            { TTL: 60 * 60, urgency: notification.level === "ACTION_REQUIRED" ? "high" : "normal" },
          );
          delivered += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The push service says this subscription is gone for good.
            await deletePushSubscription(db, sub.endpoint);
          } else {
            await recordPushFailure(db, sub.endpoint);
          }
        }
      }),
    );

    if (delivered > 0) {
      await markNotificationPushed(db, notification.id);
      // Product analytics: a push was dispatched. Browser APIs cannot confirm
      // OS delivery, so this is "sent", never "delivered" (M9.5 §20).
      forwardServerAnalyticsEvent({
        event: "push_sent",
        actorKey: notification.recipientKey,
        role: notification.audience === "BUSINESS" ? "business" : "buyer",
        props: { domain_event: notification.event },
        insertId: `push_sent:${notification.id}`,
      });
    }
    return delivered;
  } catch {
    // A failure here must never touch the caller (§17, §18).
    return 0;
  }
}
