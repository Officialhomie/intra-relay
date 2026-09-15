import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { conversationSessions } from "@/lib/db/schema";

import type { ConversationTurn } from "./memory";
import type { ConversationIntent, UserIntent } from "./types";

/**
 * Durable storage for one buyer session's conversation (M10.4, ADR-025). Thin
 * — no TTL, no turn-capping, no merge logic here; `memory.ts` owns those
 * rules and calls this as its storage backend, the same split every other
 * feature uses between its `repository.ts` and its service logic.
 */

export interface ConversationSessionRow {
  sessionId: string;
  intent: UserIntent;
  lastIntentKind: ConversationIntent | null;
  turns: ConversationTurn[];
  updatedAt: Date;
}

export async function findConversationSession(
  db: Database,
  sessionId: string,
): Promise<ConversationSessionRow | null> {
  const [row] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.sessionId, sessionId))
    .limit(1);
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    intent: row.intent as UserIntent,
    lastIntentKind: row.lastIntentKind as ConversationIntent | null,
    turns: row.turns as ConversationTurn[],
    updatedAt: row.updatedAt,
  };
}

export async function upsertConversationSession(
  db: Database,
  input: {
    sessionId: string;
    intent: UserIntent;
    lastIntentKind: ConversationIntent | null;
    turns: ConversationTurn[];
  },
): Promise<void> {
  // `UserIntent` is a closed interface (no index signature), the jsonb column
  // is typed `Record<string, unknown>` — always a plain object at runtime, so
  // this cast is safe.
  const intent = input.intent as Record<string, unknown>;
  await db
    .insert(conversationSessions)
    .values({
      sessionId: input.sessionId,
      intent,
      lastIntentKind: input.lastIntentKind,
      turns: input.turns,
    })
    .onConflictDoUpdate({
      target: conversationSessions.sessionId,
      set: {
        intent,
        lastIntentKind: input.lastIntentKind,
        turns: input.turns,
        updatedAt: new Date(),
      },
    });
}

export async function deleteConversationSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(conversationSessions).where(eq(conversationSessions.sessionId, sessionId));
}
