import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  notifications,
  pushSubscriptions,
  type NewPushSubscriptionRow,
  type NotificationRow,
  type PushSubscriptionRow,
} from "@/lib/db/schema";

import type { NotificationAudience } from "./attention";
import type { NotificationSpec } from "./catalogue";

/**
 * Notification + push-subscription persistence. Repositories only — no policy.
 */

/**
 * Insert a notification, or fold it into the existing one for the same
 * attention item: refresh its wording and re-mark it unread so it re-surfaces
 * (§21). Returns the row now in force.
 */
export async function upsertNotification(
  db: Database,
  spec: NotificationSpec,
): Promise<NotificationRow> {
  const [row] = await db
    .insert(notifications)
    .values({
      audience: spec.audience,
      recipientKey: spec.recipientKey,
      event: spec.event,
      level: spec.level,
      title: spec.title,
      body: spec.body,
      deeplink: spec.deeplink,
      entityType: spec.entityType,
      entityId: spec.entityId,
      dedupeKey: spec.dedupeKey,
    })
    .onConflictDoUpdate({
      target: [notifications.audience, notifications.recipientKey, notifications.dedupeKey],
      set: {
        event: spec.event,
        level: spec.level,
        title: spec.title,
        body: spec.body,
        deeplink: spec.deeplink,
        entityType: spec.entityType,
        entityId: spec.entityId,
        readAt: null,
        pushedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listNotifications(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
  options: { limit?: number } = {},
): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.audience, audience), eq(notifications.recipientKey, recipientKey)))
    .orderBy(desc(notifications.updatedAt))
    .limit(options.limit ?? 50);
}

export async function countUnread(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, audience),
        eq(notifications.recipientKey, recipientKey),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export async function findNotificationById(
  db: Database,
  id: string,
): Promise<NotificationRow | null> {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return row ?? null;
}

/** Mark one notification read — scoped to its owner so it cannot be crossed. */
export async function markNotificationRead(
  db: Database,
  id: string,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<NotificationRow | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.audience, audience),
        eq(notifications.recipientKey, recipientKey),
        isNull(notifications.readAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markAllNotificationsRead(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.audience, audience),
        eq(notifications.recipientKey, recipientKey),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function markNotificationPushed(db: Database, id: string): Promise<void> {
  await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, id));
}

// --- push subscriptions ----------------------------------------------------

export async function savePushSubscription(
  db: Database,
  values: NewPushSubscriptionRow,
): Promise<PushSubscriptionRow> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        audience: values.audience,
        recipientKey: values.recipientKey,
        p256dh: values.p256dh,
        auth: values.auth,
        userAgent: values.userAgent ?? null,
        failureCount: 0,
        lastSeenAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listPushSubscriptions(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.audience, audience),
        eq(pushSubscriptions.recipientKey, recipientKey),
      ),
    );
}

export async function deletePushSubscription(db: Database, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** A push service said the subscription is gone — drop it after repeated failure. */
export async function recordPushFailure(db: Database, endpoint: string): Promise<void> {
  const [row] = await db
    .update(pushSubscriptions)
    .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning();
  if (row && row.failureCount >= 3) await deletePushSubscription(db, endpoint);
}
