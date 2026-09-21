import type { Database } from "@/lib/db/client";

import {
  deleteConversationSession,
  findConversationSession,
  upsertConversationSession,
} from "./repository";
import type { ConversationIntent, UserIntent, UserIntentField } from "./types";

/**
 * Conversation memory (milestone 6 §30; milestone 10.4).
 *
 * Holds what each session has told us so far — "I need flyers" then "500" then
 * "by Friday" accumulates into one UserIntent — so the person never repeats
 * themselves. Strictly per-session: one session's context is never visible to
 * another (§30, §31).
 *
 * Persisted in the same Postgres/PGlite database as everything else (M10.4,
 * ADR-025) — an earlier `globalThis` in-memory version could not survive a
 * fresh serverless instance, which defeats "stateful" on the platform this
 * actually runs on. `repository.ts` is the storage backend; this module owns
 * the rules on top of it (staleness, the turn cap, the merge).
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface ConversationState {
  sessionId: string;
  intent: UserIntent;
  lastIntentKind: ConversationIntent | null;
  turns: ConversationTurn[];
  updatedAt: string;
}

const TTL_MS = 60 * 60 * 1000; // an hour of inactivity
const MAX_TURNS = 40;

function fresh(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() < TTL_MS;
}

export async function getConversation(
  db: Database,
  sessionId: string,
): Promise<ConversationState | null> {
  const row = await findConversationSession(db, sessionId);
  if (!row) return null;
  if (!fresh(row.updatedAt)) return null;
  return {
    sessionId: row.sessionId,
    intent: row.intent,
    lastIntentKind: row.lastIntentKind,
    turns: row.turns,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Merge newly-extracted fields into a session's intent. A later value for a
 * field replaces the earlier one (the person corrected themselves); a field
 * absent from `extracted` is left untouched.
 *
 * Returns `changed` (every field this turn set or altered, first-fills
 * included — the existing signal callers already use) and `corrected`
 * (the STRICT subset of `changed` where `base` already held a different,
 * defined value — i.e. an actual contradiction of something already said,
 * detected rather than silently combined, milestone 10.4 step 3).
 */
export function mergeUserIntent(
  base: UserIntent,
  extracted: Partial<UserIntent>,
): { intent: UserIntent; changed: UserIntentField[]; corrected: UserIntentField[] } {
  const intent: UserIntent = { ...base };
  const changed: UserIntentField[] = [];
  const corrected: UserIntentField[] = [];
  for (const [key, value] of Object.entries(extracted) as [UserIntentField, unknown][]) {
    if (value === undefined) continue;
    const prior = intent[key];
    if (JSON.stringify(prior) !== JSON.stringify(value)) {
      changed.push(key);
      if (prior !== undefined) corrected.push(key);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (intent as any)[key] = value;
  }
  return { intent, changed, corrected };
}

export interface RecordTurnInput {
  sessionId: string;
  userText: string;
  extracted: Partial<UserIntent>;
  intentKind: ConversationIntent;
  assistantText?: string;
}

export interface RecordTurnResult {
  state: ConversationState;
  changed: UserIntentField[];
  corrected: UserIntentField[];
}

/** Append a turn and fold its extracted fields into the session's intent. */
export async function recordTurn(db: Database, input: RecordTurnInput): Promise<RecordTurnResult> {
  const now = new Date();
  const existing = await getConversation(db, input.sessionId);
  const priorIntent = existing?.intent ?? {};
  const priorTurns = existing?.turns ?? [];

  const { intent, changed, corrected } = mergeUserIntent(priorIntent, input.extracted);

  const turns: ConversationTurn[] = [
    ...priorTurns,
    { role: "user", text: input.userText, at: now.toISOString() },
  ];
  if (input.assistantText) {
    turns.push({ role: "assistant", text: input.assistantText, at: now.toISOString() });
  }
  const cappedTurns = turns.slice(-MAX_TURNS);

  await upsertConversationSession(db, {
    sessionId: input.sessionId,
    intent,
    lastIntentKind: input.intentKind,
    turns: cappedTurns,
  });

  return {
    state: {
      sessionId: input.sessionId,
      intent,
      lastIntentKind: input.intentKind,
      turns: cappedTurns,
      updatedAt: now.toISOString(),
    },
    changed,
    corrected,
  };
}

/** Forget a session — used when a run completes or the person starts over. */
export async function clearConversation(db: Database, sessionId: string): Promise<void> {
  await deleteConversationSession(db, sessionId);
}
