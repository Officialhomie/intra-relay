import { isConfident } from "./classify";
import { missingForQuote, resolveDomain, serviceableCategories } from "./domain";
import { describeMissing, informationalReply, conversationalReply } from "./reply";
import type { IntentReading, UserIntent } from "./types";

/**
 * Deciding what to do with a reading (milestone 6 §14).
 *
 * This connects the conversational layer to the EXISTING deterministic
 * workflows — it never duplicates their logic and never performs a consequential
 * action itself. For anything commercial it produces an intent to act plus a
 * payload; the deterministic caller carries it out and enforces every rule
 * (eligibility, ownership, quote validity, the human-approval gate) regardless
 * of what this function returned (milestone 6 §6, §31).
 */

export type RouteAction =
  | { kind: "REPLY"; message: string }
  | { kind: "ASK"; message: string; missing: (keyof UserIntent)[] }
  | { kind: "EXPLAIN_UNAVAILABLE"; message: string; category: string }
  | {
      kind: "START_QUOTE";
      routeSlug: string;
      category: string;
      request: string;
      intent: UserIntent;
    }
  | { kind: "RESUME_TRANSACTION"; message: string }
  | { kind: "RESUME_FULFILLMENT"; message: string };

export interface RouteInput {
  reading: IntentReading;
  /** The session's full accumulated intent (already merged with this turn). */
  intent: UserIntent;
  /** The person's raw message, forwarded to the agent run as its request. */
  message: string;
  hasOpenTransaction?: boolean;
}

export function routeReading(input: RouteInput): RouteAction {
  const { reading, intent, message } = input;

  // Low confidence: ask rather than guess a workflow (milestone 6 §6).
  if (!isConfident(reading)) {
    return reading.commercial
      ? {
          kind: "ASK",
          message: "Tell me a bit more about what you're after and I'll see who on Intra can help.",
          missing: [],
        }
      : { kind: "REPLY", message: conversationalReply(reading, intent) };
  }

  switch (reading.intent) {
    case "CONVERSATION":
      return { kind: "REPLY", message: conversationalReply(reading, intent) };

    case "INFORMATIONAL":
      return { kind: "REPLY", message: informationalReply(intent, serviceableCategories()) };

    case "TRANSACTION":
      return {
        kind: "RESUME_TRANSACTION",
        message:
          "That decision stays with you on the order itself — open the order and you'll see the choice with the amounts on it. I won't accept, decline or pay on your behalf.",
      };

    case "FULFILLMENT":
      return {
        kind: "RESUME_FULFILLMENT",
        message:
          "You confirm pickup or handover from the order page — I can't mark a job complete for you.",
      };

    case "DISCOVERY":
    case "COMPARISON":
    case "QUOTE_REQUEST": {
      const domain = resolveDomain(intent.category);
      if (!domain) {
        return {
          kind: "ASK",
          message: "What kind of service or product are you looking for?",
          missing: ["category"],
        };
      }
      if (!domain.serviceable) {
        return {
          kind: "EXPLAIN_UNAVAILABLE",
          message: domain.unavailableNote,
          category: domain.category,
        };
      }

      // Discovery, comparison and an explicit request all lead to the same
      // place: get the person real prices from real businesses. The only
      // difference is how much is still missing before the agent can ask.
      const missing = missingForQuote(domain, intent);
      if (missing.length > 0) {
        return { kind: "ASK", message: describeMissing(missing, intent), missing };
      }
      return {
        kind: "START_QUOTE",
        routeSlug: domain.routeSlug!,
        category: domain.category,
        request: message,
        intent,
      };
    }

    default:
      return { kind: "REPLY", message: conversationalReply(reading, intent) };
  }
}
