import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

/**
 * Pilot instrumentation (milestone 7 §39–§40).
 *
 * Deliberately thin. The transaction funnel is already fully recorded in
 * `audit_events` (task.created → submitted → awaiting_quote → recommendation
 * → buyer_accepted → handoff_confirmed → pickup_confirmed), so this only adds
 * the few product moments the audit trail does not already capture:
 * conversation entry, a run started from conversation, a notification opened.
 *
 * It answers one question — "where are real people getting stuck?" — not a
 * dashboard. Events are written append-only to the same audit table under a
 * `pilot.` prefix; a failure here never touches the user's action (§43).
 */

export type PilotEventName =
  | "conversation_started"
  | "conversation_run_started"
  // Attention funnel (§32, §33): created → opened → resumed → acted.
  | "notification_created"
  | "notification_opened"
  | "workflow_resumed"
  // Push + install (never records payload contents or personal data, §32).
  | "push_permission_prompted"
  | "push_permission_granted"
  | "push_permission_denied"
  | "push_subscribed"
  | "pwa_install_prompted"
  | "pwa_install_accepted";

export interface PilotEventInput {
  name: PilotEventName;
  /** A buyer session or a business id — for counting distinct people, never shown. */
  actorKey?: string | null;
  taskId?: string | null;
  businessId?: string | null;
  props?: Record<string, unknown>;
}

export async function recordPilotEvent(db: Database, input: PilotEventInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      type: `pilot.${input.name}`,
      taskId: input.taskId ?? null,
      businessId: input.businessId ?? null,
      data: {
        ...(input.actorKey ? { actor: input.actorKey } : {}),
        ...(input.props ?? {}),
      },
    });
  } catch {
    // Instrumentation must never break the thing it is measuring.
  }
}

async function countEvents(db: Database, type: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.type, type));
  return row?.n ?? 0;
}

async function countTasksWithEvent(db: Database, type: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${auditEvents.taskId})::int` })
    .from(auditEvents)
    .where(and(eq(auditEvents.type, type), sql`${auditEvents.taskId} is not null`));
  return row?.n ?? 0;
}

/**
 * The pilot funnel, counted from real rows. Every number is a genuine count;
 * where there is no data it is 0, never an estimate (§40).
 */
export interface PilotFunnel {
  conversationsStarted: number;
  runsStartedFromConversation: number;
  requestsSubmitted: number;
  quotesReceived: number;
  buyerAccepted: number;
  handoffsConfirmed: number;
  ordersCompleted: number;
  /** The attention funnel (§33): does a person actually resume the work? */
  notificationsCreated: number;
  notificationsOpened: number;
  workflowsResumed: number;
  pushSubscribed: number;
}

export async function getPilotFunnel(db: Database): Promise<PilotFunnel> {
  const [
    conversationsStarted,
    runsStartedFromConversation,
    requestsSubmitted,
    quotesReceived,
    buyerAccepted,
    handoffsConfirmed,
    ordersCompleted,
    notificationsCreated,
    notificationsOpened,
    workflowsResumed,
    pushSubscribed,
  ] = await Promise.all([
    countEvents(db, "pilot.conversation_started"),
    countEvents(db, "pilot.conversation_run_started"),
    countTasksWithEvent(db, "task.submitted"),
    countTasksWithEvent(db, "quote.received"),
    countTasksWithEvent(db, "task.buyer_accepted"),
    countTasksWithEvent(db, "task.handoff_confirmed"),
    countTasksWithEvent(db, "proofline.pickup_confirmed"),
    countEvents(db, "pilot.notification_created"),
    countEvents(db, "pilot.notification_opened"),
    countEvents(db, "pilot.workflow_resumed"),
    countEvents(db, "pilot.push_subscribed"),
  ]);
  return {
    conversationsStarted,
    runsStartedFromConversation,
    requestsSubmitted,
    quotesReceived,
    buyerAccepted,
    handoffsConfirmed,
    ordersCompleted,
    notificationsCreated,
    notificationsOpened,
    workflowsResumed,
    pushSubscribed,
  };
}
