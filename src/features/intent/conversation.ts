import { classifyMessage } from "./classify";
import { clearConversation, getConversation, recordTurn } from "./memory";
import { explainOptimization } from "./optimization";
import { summariseIntent } from "./reply";
import { routeReading, type RouteAction } from "./routing";
import type {
  ConversationIntent,
  OptimizationPreference,
  UserIntent,
  UserIntentField,
} from "./types";

/**
 * One turn of the conversation (milestone 6 §2–§14, §23–§27, §30; milestone 7
 * §6–§9).
 *
 * Pure orchestration over the deterministic pieces: classify the message in the
 * context of the session so far, decide what to do, remember the turn. It never
 * starts a run or touches the database — the caller does that from the returned
 * `action`, so every safety rule is still enforced by the deterministic layer
 * (§6, §31).
 */

/** A run brief in the shape the buyer-agent accepts as a human correction. */
export interface RunBrief {
  quantity?: number;
  size?: string;
  colour?: string;
  /** A calendar date, `YYYY-MM-DD`. */
  deadline?: string;
  deliveryArea?: string;
}

export interface ConversationAction {
  /** NONE: just a reply. NEEDS_INFO: ask for fields. UNAVAILABLE: no provider
   * network for this category. START_RUN: hand `request` + `brief` to the buyer
   * agent. RESUME_ORDER: the decision belongs on the order surface. */
  kind: "NONE" | "NEEDS_INFO" | "UNAVAILABLE" | "START_RUN" | "RESUME_ORDER";
  missing?: UserIntentField[];
  category?: string;
  /** Readable request text for the agent run (START_RUN only). */
  request?: string;
  /** The accumulated brief, forwarded so the agent uses what the person said
   * across the whole conversation rather than re-reading the last message. */
  brief?: RunBrief;
}

export interface ConversationReply {
  /** What the assistant says, in plain language. */
  message: string;
  intent: ConversationIntent;
  commercial: boolean;
  /** The whole accumulated intent — safe to show the person as "what I have". */
  understood: UserIntent;
  /** UserIntent fields this message changed. */
  changed: UserIntentField[];
  optimization: OptimizationPreference | null;
  /** A one-line plain description of the optimization, when one was stated. */
  optimizationNote: string | null;
  action: ConversationAction;
}

export interface ConversationTurnInput {
  sessionId: string;
  message: string;
  /** Whether this session has an order awaiting a decision. */
  hasOpenTransaction?: boolean;
  now?: Date;
}

/** Map the accumulated intent to the agent's brief-correction shape. */
function toRunBrief(intent: UserIntent): RunBrief {
  const brief: RunBrief = {};
  if (intent.quantity !== undefined) brief.quantity = intent.quantity;
  if (intent.size) brief.size = intent.size;
  if (intent.colour) brief.colour = intent.colour;
  if (intent.deadline?.iso) brief.deadline = intent.deadline.iso.slice(0, 10);
  if (intent.location) brief.deliveryArea = intent.location;
  return brief;
}

/** A readable one-line request for the run, built from everything said so far. */
function describeRequest(intent: UserIntent, fallback: string): string {
  const summary = summariseIntent(intent);
  return summary ? `I need ${summary}` : fallback;
}

function toAction(routed: RouteAction, intent: UserIntent, message: string): ConversationAction {
  switch (routed.kind) {
    case "ASK":
      return { kind: "NEEDS_INFO", missing: routed.missing };
    case "EXPLAIN_UNAVAILABLE":
      return { kind: "UNAVAILABLE", category: routed.category };
    case "START_QUOTE":
      return {
        kind: "START_RUN",
        category: routed.category,
        request: describeRequest(routed.intent, message),
        brief: toRunBrief(routed.intent),
      };
    case "RESUME_TRANSACTION":
    case "RESUME_FULFILLMENT":
      return { kind: "RESUME_ORDER" };
    default:
      return { kind: "NONE" };
  }
}

export function handleConversationTurn(input: ConversationTurnInput): ConversationReply {
  const stored = getConversation(input.sessionId)?.intent ?? {};

  // Peek at this message's category. If the person has clearly changed subject
  // ("flyers" → "a phone"), the earlier brief no longer applies — start it over
  // rather than carrying stale quantity/deadline into the new topic (§30).
  const peekedCategory = classifyMessage(input.message, { now: input.now }).extracted.category;
  const topicSwitched =
    peekedCategory !== undefined &&
    stored.category !== undefined &&
    peekedCategory !== stored.category;
  if (topicSwitched) clearConversation(input.sessionId);
  const prior = topicSwitched ? {} : stored;

  const reading = classifyMessage(input.message, {
    priorIntent: prior,
    hasOpenTransaction: input.hasOpenTransaction,
    now: input.now,
  });

  const merged: UserIntent = { ...prior, ...reading.extracted };
  const routed = routeReading({
    reading,
    intent: merged,
    message: input.message,
    hasOpenTransaction: input.hasOpenTransaction,
  });

  const startMessage =
    routed.kind === "START_QUOTE"
      ? `Got it${summariseIntent(merged) ? ` — ${summariseIntent(merged)}` : ""}. Let me get you real prices from businesses that can do this — I'll come back with a recommendation for you to decide on.`
      : null;

  const message =
    ("message" in routed && routed.message) || startMessage || "Tell me a bit more and I'll help.";

  const { state, changed } = recordTurn({
    sessionId: input.sessionId,
    userText: input.message,
    extracted: reading.extracted,
    intentKind: reading.intent,
    assistantText: message,
  });

  const optimization = reading.optimization ?? state.intent.optimization ?? null;
  const startsRun = routed.kind === "START_QUOTE";
  const optimizationNote =
    optimization && startsRun
      ? explainOptimization(optimization, {
          location: state.intent.location,
          budget: state.intent.budget
            ? `${state.intent.budget.currency} ${state.intent.budget.amount.toLocaleString()}`
            : undefined,
        })
      : null;

  return {
    message,
    intent: reading.intent,
    commercial: reading.commercial,
    understood: state.intent,
    changed,
    optimization,
    optimizationNote,
    action: toAction(routed, state.intent, input.message),
  };
}

/**
 * Deliberately forget this session's conversation — the person asked to start a
 * new request (§9). This clears the in-memory conversation state ONLY. It
 * cannot touch orders, quotes or history: those live in the database and this
 * function has no database access by construction.
 */
export function resetConversation(sessionId: string): void {
  clearConversation(sessionId);
}
