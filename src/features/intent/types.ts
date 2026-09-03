/**
 * The conversational intent layer (milestone 6).
 *
 * This sits ABOVE the deterministic commerce workflow. Its only job is to read
 * what a person is trying to accomplish from plain language, and decide whether
 * a structured commerce workflow should be involved at all. It never runs a
 * transaction, never mutates commercial terms, never authorises payment — those
 * remain the deterministic system's job (CLAUDE.md §4.3, milestone 6 §6, §31).
 */

/**
 * How a message relates to commerce. Ordered from "just talking" to "acting on
 * a live transaction". Only DISCOVERY and beyond involve a provider workflow.
 */
export const CONVERSATION_INTENTS = [
  "CONVERSATION", // greeting, small talk, thanks — no commercial content
  "INFORMATIONAL", // a question about what Intra or a business can do
  "DISCOVERY", // "who can print flyers near Yaba?" — find providers
  "COMPARISON", // "which is cheapest?" — compare known providers/options
  "QUOTE_REQUEST", // "I need 500 flyers by Friday" — enough to ask for a price
  "TRANSACTION", // acting on an existing quote — accept, decline, price change
  "FULFILLMENT", // acting on an agreed job — pickup, handover, completion
] as const;
export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

/** Intents that put a real commerce workflow in motion. */
export const COMMERCIAL_INTENTS: readonly ConversationIntent[] = [
  "DISCOVERY",
  "COMPARISON",
  "QUOTE_REQUEST",
  "TRANSACTION",
  "FULFILLMENT",
];

export function isCommercialIntent(intent: ConversationIntent): boolean {
  return COMMERCIAL_INTENTS.includes(intent);
}

/**
 * How the person wants options weighed. Interpreted from plain language, never
 * shown as an enum, and always explained back in words (milestone 6 §8).
 */
export const OPTIMIZATION_PREFERENCES = [
  "CHEAPEST",
  "NEAREST",
  "FASTEST",
  "BEST_VALUE",
  "AVAILABLE_NOW",
  "WITHIN_BUDGET",
  "EARLIEST",
] as const;
export type OptimizationPreference = (typeof OPTIMIZATION_PREFERENCES)[number];

/**
 * What the person wants — accumulated across the conversation (milestone 6 §7,
 * §30). Every field is optional: the layer records only what was actually said
 * and never invents a value to fill a gap. This is deliberately domain-neutral
 * ("what does the user want?") and separate from any workflow's required inputs
 * ("what does the system need to proceed?").
 */
export interface UserIntent {
  /** One plain sentence: the outcome the person is after. */
  goal?: string;
  /** A broad service category, when it can be told ("printing", "food"). */
  category?: string;
  /** The specific service or product ("flyers", "used iPhone 12"). */
  service?: string;
  quantity?: number;
  /** Paper size for a print job ("A5"). */
  size?: string;
  /** Colour preference for a print job ("full colour", "black and white"). */
  colour?: string;
  /** A stated budget ceiling, with its currency. */
  budget?: { amount: number; currency: string };
  /** Where the person is, or wants the work done / delivered. */
  location?: string;
  /** A deadline phrase as said ("by Friday"), plus an ISO date if resolvable. */
  deadline?: { phrase: string; iso: string | null };
  /** They explicitly need it available/open right now. */
  availabilityRequired?: boolean;
  /** Condition constraint, for goods ("new", "used", "refurbished"). */
  condition?: string;
  optimization?: OptimizationPreference;
  /** How they want to receive it ("pickup", "delivery"). */
  fulfillmentPreference?: string;
}

/** Field names on UserIntent, for "what changed this turn" reporting. */
export type UserIntentField = keyof UserIntent;

/**
 * The layer's reading of one message, in the context of the conversation so
 * far. `extracted` holds only what this message added or changed.
 */
export interface IntentReading {
  intent: ConversationIntent;
  commercial: boolean;
  /** 0–1. Below `INTENT_CONFIDENCE_FLOOR` the layer asks rather than routes. */
  confidence: number;
  optimization: OptimizationPreference | null;
  /** UserIntent fields this message contributed. */
  extracted: Partial<UserIntent>;
  /** Signals that fired, for the trace — never shown raw to the user. */
  signals: string[];
}

export const INTENT_CONFIDENCE_FLOOR = 0.5;
