import { extractUserIntent } from "./extract";
import { readOptimization } from "./optimization";
import {
  INTENT_CONFIDENCE_FLOOR,
  isCommercialIntent,
  type ConversationIntent,
  type IntentReading,
  type UserIntent,
} from "./types";

/**
 * Reading one message in the context of the conversation so far (milestone 6
 * §2–§5). Deterministic and rule-based: the same message with the same context
 * always classifies the same way, and it runs with no model key. A model may
 * refine a low-confidence reading later, but never overrides the safety-facing
 * decision of whether to enter a workflow (milestone 6 §6).
 *
 * The layer is a normal assistant first: a message with no commercial content
 * is CONVERSATION, and it stays there until the person actually asks for
 * something buyable.
 */

const GREETING =
  /^\s*(hi|hey+|hello|yo|good (morning|afternoon|evening)|how far|abeg|wetin dey|sup|what'?s up|howdy)\b/i;
const THANKS = /\b(thanks|thank you|thx|appreciate it|cheers|nice one|well done|great job)\b/i;
const SMALLTALK_ONLY =
  /^\s*(ok(ay)?|cool|nice|sure|alright|got it|lol|haha|hmm+|yeah|yes|no|maybe)\s*[.!]?\s*$/i;

const CAPABILITY_QUESTION =
  /\b(do you|can you|does (?:this|it|intra)|is there|are there|what (?:can|do|is|does)|how (?:do(?:es)?|can)|tell me about|explain|is it possible)\b/i;
const PRICE_QUESTION =
  /\b(how much|what'?s the (?:price|cost|rate)|price of|cost of|going rate|charge for|rates?\b)\b/i;

const DISCOVERY_VERB =
  /\b(find|who (?:can|does|sells?)|where can i|looking for|need someone|any(?:one|body)? (?:who|that)|recommend|suggest|locate|search for)\b/i;
const COMPARISON_VERB =
  /\b(compare|which (?:is|one)|cheaper|cheapest|best (?:option|one|deal)|versus|vs\.?|difference between|better)\b/i;
const REQUEST_VERB =
  /\b(i (?:need|want|would like)|get me|order|book|request a quote|quote for|can i get|i'?m after|send me)\b/i;
const TRANSACTION_VERB =
  /\b(accept|decline|reject|approve|agree to (?:the|this) price|go ahead|confirm the order|pay|cancel (?:the|my|this) order|keep the price|take the new price)\b/i;
const FULFILLMENT_VERB =
  /\b(picked (?:it )?up|collected|i (?:have|'ve) received|confirm pickup|it'?s ready|mark (?:it )?complete|hand(?:ed)? over|got the (?:flyers|order|job))\b/i;

/** Does the accumulated intent carry enough to ask a provider for a price? */
function briefIsRequestable(intent: UserIntent): boolean {
  if (!intent.service && !intent.category) return false;
  return intent.quantity !== undefined || intent.deadline !== undefined;
}

interface ClassifyContext {
  /** UserIntent accumulated from earlier turns (not yet merged with this one). */
  priorIntent?: UserIntent;
  /** True when this session already has an order in a decidable state. */
  hasOpenTransaction?: boolean;
  now?: Date;
}

export function classifyMessage(message: string, context: ClassifyContext = {}): IntentReading {
  const text = message.trim();
  const prior = context.priorIntent ?? {};
  // The conversation is waiting on a quantity when a printing brief is in
  // progress and none has been given — so "500 A5 full colour" reads its "500".
  const quantityExpected =
    prior.quantity === undefined && (prior.category === "printing" || prior.service !== undefined);
  const extracted = extractUserIntent(text, context.now, { quantityExpected });
  const merged: UserIntent = { ...prior, ...extracted };
  const signals: string[] = [];

  const record = (
    intent: ConversationIntent,
    confidence: number,
    ...why: string[]
  ): IntentReading => {
    signals.push(...why);
    return {
      intent,
      commercial: isCommercialIntent(intent),
      confidence,
      optimization: readOptimization(text),
      extracted,
      signals,
    };
  };

  // --- non-commercial first: a normal assistant --------------------------
  const hasCommercialContent =
    Object.keys(extracted).length > 0 ||
    DISCOVERY_VERB.test(text) ||
    COMPARISON_VERB.test(text) ||
    REQUEST_VERB.test(text) ||
    PRICE_QUESTION.test(text);

  if (SMALLTALK_ONLY.test(text)) return record("CONVERSATION", 0.9, "smalltalk-only");
  if ((GREETING.test(text) || THANKS.test(text)) && !hasCommercialContent) {
    return record("CONVERSATION", 0.92, GREETING.test(text) ? "greeting" : "thanks");
  }

  // --- acting on an existing transaction / job ---------------------------
  if (FULFILLMENT_VERB.test(text)) return record("FULFILLMENT", 0.8, "fulfillment-verb");
  if (TRANSACTION_VERB.test(text) && context.hasOpenTransaction) {
    return record("TRANSACTION", 0.85, "transaction-verb", "has-open-transaction");
  }
  if (TRANSACTION_VERB.test(text)) {
    return record("TRANSACTION", 0.55, "transaction-verb", "no-open-transaction");
  }

  // --- exploring / requesting ------------------------------------------
  const requestable = briefIsRequestable(merged);

  if (PRICE_QUESTION.test(text) || REQUEST_VERB.test(text)) {
    const why = PRICE_QUESTION.test(text) ? "price-question" : "request-verb";
    // "I need flyers" is a quote request even before the brief is complete —
    // routing asks for the missing details (progressive collection, §3/§13).
    if (requestable) return record("QUOTE_REQUEST", 0.8, why, "brief-requestable");
    if (merged.service || merged.category) {
      return record("QUOTE_REQUEST", 0.66, why, "brief-incomplete");
    }
    return record("INFORMATIONAL", 0.55, why, "no-service-yet");
  }

  if (COMPARISON_VERB.test(text)) return record("COMPARISON", 0.7, "comparison-verb");
  if (DISCOVERY_VERB.test(text)) return record("DISCOVERY", 0.72, "discovery-verb");

  // A question about what can be done — even one that names a service — is asking,
  // not requesting. It only becomes a workflow once the person says "I need…".
  if (CAPABILITY_QUESTION.test(text)) return record("INFORMATIONAL", 0.7, "capability-question");

  // A bare detail that tips a brief already in progress into being requestable
  // ("500" after "I need flyers by Friday"). It is this turn's field that made
  // the difference, whichever field it was.
  if (requestable && !briefIsRequestable(prior)) {
    return record("QUOTE_REQUEST", 0.7, "brief-completed-this-turn");
  }
  if (Object.keys(extracted).length > 0 && (merged.service || merged.category)) {
    // A further detail on a brief that is already requestable is still a quote
    // request — routing collects anything still missing.
    return record(
      requestable ? "QUOTE_REQUEST" : "DISCOVERY",
      requestable ? 0.68 : 0.55,
      "commercial-detail",
      "brief-in-progress",
    );
  }

  // Nothing commercial and not a clear question — keep talking.
  return record("CONVERSATION", 0.5, "no-commercial-signal");
}

/** Whether a reading is confident enough to route without asking first. */
export function isConfident(reading: IntentReading): boolean {
  return reading.confidence >= INTENT_CONFIDENCE_FLOOR;
}
