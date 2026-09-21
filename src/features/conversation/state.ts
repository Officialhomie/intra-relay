import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { conversationSessions } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/response";

import type { ActorReference, ConversationChannel } from "./types";

export interface ConversationContext {
  sessionId: string;
  actor: ActorReference;
  channel: ConversationChannel;
  externalConversationId: string;
  workflowState: Record<string, unknown> | null;
  pendingQuestion: string | null;
  lastAction: string | null;
  summary: string | null;
}

function contextFromRow(row: typeof conversationSessions.$inferSelect): ConversationContext {
  return {
    sessionId: row.sessionId,
    actor: {
      role: row.actorRole as ActorReference["role"],
      externalUserId: row.actorExternalUserId ?? row.sessionId,
      ...(row.businessId ? { businessId: row.businessId } : {}),
    },
    channel: row.channel as ConversationChannel,
    externalConversationId: row.externalConversationId ?? row.sessionId,
    workflowState: row.workflowState,
    pendingQuestion: row.pendingQuestion,
    lastAction: row.lastAction,
    summary: row.summary,
  };
}

export async function findConversationContext(
  db: Database,
  sessionId: string,
): Promise<ConversationContext | null> {
  const [row] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.sessionId, sessionId))
    .limit(1);
  return row ? contextFromRow(row) : null;
}

function assertSameIdentity(
  existing: ConversationContext,
  actor: ActorReference,
  channel: ConversationChannel,
  externalConversationId: string,
): void {
  const same =
    existing.actor.role === actor.role &&
    existing.actor.externalUserId === actor.externalUserId &&
    // A newly-onboarded owner gains a business association in this row. The
    // same provider identity may omit it on a later inbound delivery; an
    // adapter may never replace it with a different business id.
    (actor.businessId == null || existing.actor.businessId === actor.businessId) &&
    existing.channel === channel &&
    existing.externalConversationId === externalConversationId;
  if (!same) {
    throw new HttpError(
      409,
      "CONVERSATION_IDENTITY_CONFLICT",
      "This conversation is already associated with a different actor or channel.",
    );
  }
}

/** Bind a durable conversation to the adapter-resolved identity exactly once. */
export async function bindConversationContext(
  db: Database,
  input: Omit<ConversationContext, "workflowState" | "pendingQuestion" | "lastAction" | "summary">,
): Promise<{ context: ConversationContext; created: boolean }> {
  const existing = await findConversationContext(db, input.sessionId);
  if (existing) {
    assertSameIdentity(existing, input.actor, input.channel, input.externalConversationId);
    return { context: existing, created: false };
  }

  await db
    .insert(conversationSessions)
    .values({
      sessionId: input.sessionId,
      actorRole: input.actor.role,
      actorExternalUserId: input.actor.externalUserId,
      businessId: input.actor.businessId ?? null,
      channel: input.channel,
      externalConversationId: input.externalConversationId,
      intent: {},
      lastIntentKind: null,
      turns: [],
    })
    .onConflictDoNothing();

  const bound = await findConversationContext(db, input.sessionId);
  if (!bound) throw new Error("Conversation binding was not persisted.");
  assertSameIdentity(bound, input.actor, input.channel, input.externalConversationId);
  return { context: bound, created: true };
}

export async function updateConversationWorkflow(
  db: Database,
  sessionId: string,
  input: {
    workflowState: Record<string, unknown> | null;
    pendingQuestion: string | null;
    lastAction: string | null;
    summary: string | null;
    businessId?: string;
  },
): Promise<void> {
  await db
    .update(conversationSessions)
    .set({
      workflowState: input.workflowState,
      pendingQuestion: input.pendingQuestion,
      lastAction: input.lastAction,
      summary: input.summary,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversationSessions.sessionId, sessionId));
}
