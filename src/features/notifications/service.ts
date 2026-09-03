import type { Database } from "@/lib/db/client";
import type { NotificationRow, QuoteRow, TaskRow } from "@/lib/db/schema";
import { findBusinessById } from "@/features/businesses/repository";
import { findRouteById } from "@/features/routes/repository";
import { findTaskById, listTaskQuotes } from "@/features/tasks/repository";

import type { AttentionLevel, NotificationAudience } from "./attention";
import { needsAttention } from "./attention";
import { specsForEvent, type DomainEventContext, type EventBusiness } from "./catalogue";
import { countUnread, listNotifications, upsertNotification } from "./repository";

/**
 * Turn a domain event into whatever human notifications it warrants
 * (milestone 7 §13). Callers pass the event and the ids involved; this resolves
 * the entities, asks the catalogue who needs to know, writes the notification
 * rows, and fires web push for the ones that need attention.
 *
 * It never throws into its caller: a notification failing must not fail the
 * order action that triggered it.
 */

export interface NotifyInput {
  event: string;
  taskId?: string | null;
  quoteId?: string | null;
}

async function resolveContext(
  db: Database,
  input: NotifyInput,
): Promise<DomainEventContext | null> {
  if (!input.taskId) return null;
  const task = await findTaskById(db, input.taskId);
  if (!task) return null;

  let quote: QuoteRow | null = null;
  if (input.quoteId) {
    const quotes = await listTaskQuotes(db, task.id);
    quote = quotes.find((q) => q.id === input.quoteId) ?? null;
  }

  let business: EventBusiness | null = null;
  if (task.routeId) {
    const route = await findRouteById(db, task.routeId);
    if (route) {
      const row = await findBusinessById(db, route.businessId);
      if (row) {
        business = { id: row.id, name: row.name, slug: row.slug, manageToken: row.manageToken };
      }
    }
  }

  return { event: input.event, task, quote, business };
}

export async function notify(db: Database, input: NotifyInput): Promise<NotificationRow[]> {
  try {
    const ctx = await resolveContext(db, input);
    if (!ctx) return [];
    const specs = specsForEvent(ctx);
    const rows: NotificationRow[] = [];
    for (const spec of specs) {
      rows.push(await upsertNotification(db, spec));
    }
    // Phase C hooks web-push here: for each row whose level needsAttention,
    // deliver a safe payload to the recipient's stored subscriptions.
    return rows;
  } catch {
    return [];
  }
}

// --- reads for the in-app surfaces (§10, §11, §14, §15) -------------------

export interface NotificationView {
  id: string;
  event: string;
  level: AttentionLevel;
  title: string;
  body: string;
  deeplink: string;
  read: boolean;
  at: string;
}

export interface InboxView {
  unread: number;
  items: NotificationView[];
}

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    event: row.event,
    level: row.level,
    title: row.title,
    body: row.body,
    deeplink: row.deeplink,
    read: row.readAt !== null,
    at: row.updatedAt.toISOString(),
  };
}

export async function getInbox(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<InboxView> {
  const [rows, unread] = await Promise.all([
    listNotifications(db, audience, recipientKey, { limit: 50 }),
    countUnread(db, audience, recipientKey),
  ]);
  return { unread, items: rows.map(toView) };
}

/** The action-centre split: what needs the person now, and what is just news. */
export interface ActionCentreView {
  needsAttention: NotificationView[];
  updates: NotificationView[];
  unread: number;
}

export async function getActionCentre(
  db: Database,
  audience: NotificationAudience,
  recipientKey: string,
): Promise<ActionCentreView> {
  const { items, unread } = await getInbox(db, audience, recipientKey);
  return {
    unread,
    needsAttention: items.filter((i) => needsAttention(i.level)),
    updates: items.filter((i) => !needsAttention(i.level)),
  };
}

export type { TaskRow };
