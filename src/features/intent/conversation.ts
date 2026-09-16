import type { Database } from "@/lib/db/client";

import type { ModelProvider } from "../agent/model/types";
import { interpretUnknownMessage } from "./assist";
import { classifyMessage } from "./classify";
import { clearConversation, getConversation, recordTurn, type ConversationTurn } from "./memory";
import { explainOptimization } from "./optimization";
import { summariseIntent } from "./reply";
import { routeReading, type RouteAction } from "./routing";
import type {
  ConversationIntent,
  IntentReading,
  OptimizationPreference,
  UserIntent,
  UserIntentField,
} from "./types";
import type { CanonicalLocation } from "@/features/locations/lagos";

/**
 * One turn of the conversation (milestone 6 §2–§14, §23–§27, §30; milestone 7
 * §6–§9; milestone 10.4).
 *
 * Pure orchestration over the deterministic pieces: classify the message in the
 * context of the session so far, decide what to do, remember the turn. It never
 * starts a run itself — the caller does that from the returned `action`, so
 * every safety rule is still enforced by the deterministic layer (§6, §31).
 *
 * The deterministic classifier runs first, always. Only when it comes back
 * with no category at all — this turn or any prior one — does this reach for
 * the bounded, schema-validated Haiku fallback (`assist.ts`; see
 * `tryAssistedClassification` for the three distinct shapes that counts as).
 * Even then, the model only ever proposes a category name; `routeReading` and
 * `resolveDomain` (unchanged) are the only things that decide what happens
 * with it (milestone 10.4 step 8).
 */

/** A run brief in the shape the buyer-agent accepts as a human correction. */
export interface RunBrief {
  quantity?: number;
  size?: string;
  colour?: string;
  /** A calendar date, `YYYY-MM-DD`. */
  deadline?: string;
  deliveryArea?: string;
  /** Forwarded to the agent's candidate-evaluation foundation (M10.9) — advisory
   * and authoritative only for explicit fulfilment mismatches. */
  fulfillmentPreference?: "pickup" | "delivery";
  optimization?: OptimizationPreference;
  budget?: { amount: number; currency: string };
  productType?: string;
  canonicalLocation?: CanonicalLocation | null;
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
  /** UserIntent fields this message changed (first-time fills included). */
  changed: UserIntentField[];
  /** The strict subset of `changed` that overwrote a value already on file —
   * a correction/contradiction, detected rather than silently combined. */
  corrected: UserIntentField[];
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
  /** Test-only: injected model provider for the assisted fallback; falls back
   * to `resolveModelProvider()`. Undefined (the normal case) resolves from
   * the environment; `null` forces the deterministic-only path. */
  modelProvider?: ModelProvider | null;
}

/** Map the accumulated intent to the agent's brief-correction shape. */
function toRunBrief(intent: UserIntent): RunBrief {
  const brief: RunBrief = {};
  if (intent.quantity !== undefined) brief.quantity = intent.quantity;
  if (intent.size) brief.size = intent.size;
  if (intent.colour) brief.colour = intent.colour;
  if (intent.deadline?.iso) brief.deadline = intent.deadline.iso.slice(0, 10);
  if (intent.location) brief.deliveryArea = intent.location;
  if (intent.fulfillmentPreference === "pickup" || intent.fulfillmentPreference === "delivery") {
    brief.fulfillmentPreference = intent.fulfillmentPreference;
  }
  if (intent.optimization) brief.optimization = intent.optimization;
  if (intent.budget) brief.budget = intent.budget;
  if (intent.productType) brief.productType = intent.productType;
  if (intent.canonicalLocation) brief.canonicalLocation = intent.canonicalLocation;
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

/** Confidence the model reported, mapped onto the deterministic 0–1 scale
 * `isConfident` already uses — always at or above the floor, since the model
 * was only asked when the deterministic layer had nothing at all. */
function confidenceScore(level: "low" | "medium" | "high"): number {
  if (level === "high") return 0.85;
  if (level === "medium") return 0.7;
  return 0.55;
}

/**
 * Reach for the assisted fallback only when the deterministic layer drew a
 * total blank: no commercial verb, no extracted field, AND no category known
 * from any earlier turn either. This is deliberately narrow — it is exactly
 * the "cakes"-before-the-vocabulary-fix failure mode, generalised to any word
 * the deterministic keyword lists don't cover yet, and nothing else. A brief
 * already in progress (a category already known) never reaches this: an
 * odd/unparseable follow-up mid-brief keeps today's behaviour untouched.
 */
async function tryAssistedClassification(
  reading: IntentReading,
  routedWithoutAssist: RouteAction,
  prior: UserIntent,
  message: string,
  recentTurns: ConversationTurn[],
  modelProvider: ModelProvider | null | undefined,
): Promise<{ reading: IntentReading; clarification: string | null }> {
  const noCategoryYet = !prior.category && !reading.extracted.category;
  // Three distinct shapes the deterministic layer produces for "I don't know
  // what category this is", depending only on which verb (if any) was
  // present: a bare unrecognised word ("cakes") never reaches `routeReading`'s
  // domain check at all and comes back as a plain REPLY (signal
  // "no-commercial-signal"); "how much for X" / "I need X" with no
  // recognised X comes back as a different REPLY (signal "no-service-yet");
  // a discovery/comparison verb ("find me...") DOES reach the domain check
  // and comes back asking for "category" by name. All three are the same
  // underlying gap: extraction found no category and nothing prior did either.
  const unknownSignal =
    reading.signals.includes("no-commercial-signal") || reading.signals.includes("no-service-yet");
  const askedForCategory =
    routedWithoutAssist.kind === "ASK" && routedWithoutAssist.missing.includes("category");
  if (!noCategoryYet || !(unknownSignal || askedForCategory)) {
    return { reading, clarification: null };
  }

  const assisted = await interpretUnknownMessage({
    message,
    knownIntent: prior,
    recentTurns,
    modelProvider,
  });
  if (!assisted) return { reading, clarification: null };

  if (assisted.category) {
    return {
      reading: {
        ...reading,
        intent: "DISCOVERY",
        commercial: true,
        confidence: confidenceScore(assisted.confidence),
        extracted: {
          ...reading.extracted,
          category: assisted.category,
          ...(assisted.service ? { service: assisted.service } : {}),
        },
        signals: [...reading.signals, "assisted-classification"],
      },
      clarification: null,
    };
  }

  return { reading, clarification: assisted.clarificationQuestion };
}

export async function handleConversationTurn(
  db: Database,
  input: ConversationTurnInput,
): Promise<ConversationReply> {
  const existing = await getConversation(db, input.sessionId);
  const stored = existing?.intent ?? {};

  // Peek at this message's category. If the person has clearly changed subject
  // ("flyers" → "a phone"), the earlier brief no longer applies — start it over
  // rather than carrying stale quantity/deadline into the new topic (§30).
  const peekedCategory = classifyMessage(input.message, { now: input.now }).extracted.category;
  const topicSwitched =
    peekedCategory !== undefined &&
    stored.category !== undefined &&
    peekedCategory !== stored.category;
  if (topicSwitched) await clearConversation(db, input.sessionId);
  const prior = topicSwitched ? {} : stored;
  const priorTurns = topicSwitched ? [] : (existing?.turns ?? []);

  const deterministic = classifyMessage(input.message, {
    priorIntent: prior,
    hasOpenTransaction: input.hasOpenTransaction,
    now: input.now,
  });
  const routedDeterministic = routeReading({
    reading: deterministic,
    intent: { ...prior, ...deterministic.extracted },
    message: input.message,
    hasOpenTransaction: input.hasOpenTransaction,
  });

  const { reading, clarification } = await tryAssistedClassification(
    deterministic,
    routedDeterministic,
    prior,
    input.message,
    priorTurns,
    input.modelProvider,
  );

  const merged: UserIntent = { ...prior, ...reading.extracted };
  const routed: RouteAction = clarification
    ? { kind: "ASK", message: clarification, missing: [] }
    : reading === deterministic
      ? routedDeterministic
      : routeReading({
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

  const { state, changed, corrected } = await recordTurn(db, {
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
    corrected,
    optimization,
    optimizationNote,
    action: toAction(routed, state.intent, input.message),
  };
}

/**
 * Deliberately forget this session's conversation — the person asked to start a
 * new request (§9). This clears the persisted conversation state ONLY. It
 * cannot touch orders, quotes or history: those live in their own tables and
 * this function never touches them.
 */
export async function resetConversation(db: Database, sessionId: string): Promise<void> {
  await clearConversation(db, sessionId);
}
