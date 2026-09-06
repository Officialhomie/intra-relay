import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { notificationPreferences } from "@/lib/db/schema";

import type { NotificationAudience } from "./attention";

/**
 * The person's control over notifications (milestone 7 §16). Deliberately two
 * switches, not a settings system:
 *
 *  - `pushEnabled`      browser/OS push at all. In-app is never affected.
 *  - `pushInformational`  also push the quiet updates, not just what needs action.
 *
 * An absent row means defaults (both off) — push only starts once the person
 * has granted permission and opted in.
 */

export interface NotificationPreferences {
  pushEnabled: boolean;
  pushInformational: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: false,
  pushInformational: false,
};

export async function getPreferences(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<NotificationPreferences> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.audience, audience),
        eq(notificationPreferences.recipientKey, recipientKey),
      ),
    )
    .limit(1);
  if (!row) return { ...DEFAULT_PREFERENCES };
  return { pushEnabled: row.pushEnabled, pushInformational: row.pushInformational };
}

export async function setPreferences(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const current = await getPreferences(db, audience, recipientKey);
  const next: NotificationPreferences = { ...current, ...patch };
  await db
    .insert(notificationPreferences)
    .values({ audience, recipientKey, ...next })
    .onConflictDoUpdate({
      target: [notificationPreferences.audience, notificationPreferences.recipientKey],
      set: { ...next, updatedAt: new Date() },
    });
  return next;
}
