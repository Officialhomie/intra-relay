import type { ConversationIntent, UserIntent, UserIntentField } from "./types";

/**
 * Conversation memory (milestone 6 §30).
 *
 * Holds what each session has told us so far — "I need flyers" then "500" then
 * "by Friday" accumulates into one UserIntent — so the person never repeats
 * themselves. Strictly per-session: one session's context is never visible to
 * another (§30, §31). Non-persistent demo state (CLAUDE.md §4.4): in memory
 * only, on `globalThis` so Next.js route modules share one store, with a TTL.
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
  createdAt: string;
  updatedAt: string;
}

const TTL_MS = 60 * 60 * 1000; // an hour of inactivity
const MAX_TURNS = 40;

interface Store {
  states: Map<string, ConversationState>;
}

const globalRef = globalThis as typeof globalThis & { __intraConversations?: Store };
const store: Store = (globalRef.__intraConversations ??= { states: new Map() });

function fresh(state: ConversationState): boolean {
  return Date.now() - new Date(state.updatedAt).getTime() < TTL_MS;
}

function sweep(): void {
  for (const [id, state] of store.states) {
    if (!fresh(state)) store.states.delete(id);
  }
}

export function getConversation(sessionId: string): ConversationState | null {
  const state = store.states.get(sessionId);
  if (!state) return null;
  if (!fresh(state)) {
    store.states.delete(sessionId);
    return null;
  }
  return state;
}

function emptyState(sessionId: string): ConversationState {
  const now = new Date().toISOString();
  return {
    sessionId,
    intent: {},
    lastIntentKind: null,
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Merge newly-extracted fields into a session's intent. A later value for a
 * field replaces the earlier one (the person corrected themselves); a field
 * absent from `extracted` is left untouched. Returns the fields that changed.
 */
export function mergeUserIntent(
  base: UserIntent,
  extracted: Partial<UserIntent>,
): { intent: UserIntent; changed: UserIntentField[] } {
  const intent: UserIntent = { ...base };
  const changed: UserIntentField[] = [];
  for (const [key, value] of Object.entries(extracted) as [UserIntentField, unknown][]) {
    if (value === undefined) continue;
    if (JSON.stringify(intent[key]) !== JSON.stringify(value)) {
      changed.push(key);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (intent as any)[key] = value;
  }
  return { intent, changed };
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
}

/** Append a turn and fold its extracted fields into the session's intent. */
export function recordTurn(input: RecordTurnInput): RecordTurnResult {
  sweep();
  const now = new Date().toISOString();
  const state = store.states.get(input.sessionId) ?? emptyState(input.sessionId);

  const { intent, changed } = mergeUserIntent(state.intent, input.extracted);

  const turns: ConversationTurn[] = [
    ...state.turns,
    { role: "user", text: input.userText, at: now },
  ];
  if (input.assistantText) {
    turns.push({ role: "assistant", text: input.assistantText, at: now });
  }

  const next: ConversationState = {
    ...state,
    intent,
    lastIntentKind: input.intentKind,
    turns: turns.slice(-MAX_TURNS),
    updatedAt: now,
  };
  store.states.set(input.sessionId, next);
  return { state: next, changed };
}

/** Forget a session — used when a run completes or the person starts over. */
export function clearConversation(sessionId: string): void {
  store.states.delete(sessionId);
}

/** Test hook: wipe the whole store. */
export function __resetConversations(): void {
  store.states.clear();
}
