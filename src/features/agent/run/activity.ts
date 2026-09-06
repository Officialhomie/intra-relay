import type { TraceEntry } from "../trace";
import { looksTechnical } from "./copy";

/**
 * The "who did what" feed.
 *
 * The engineering trace records every tool call, HTTP result and model
 * exchange. That is the wrong artefact to put in front of a buyer, but the
 * *shape* of it is exactly what makes the system legible: a person asked, an
 * agent worked, a printer answered, a person decided.
 *
 * So this derives a short, actor-attributed narrative from the same trace, and
 * drops everything that is implementation (tool names, HTTP, latency, model
 * plumbing). Nothing here is invented — every line comes from a recorded event.
 */

export type ActivityActor = "you" | "agent" | "printer" | "system";

export type ActivityTone = "normal" | "recovery" | "blocked" | "decision";

export interface ActivityItem {
  actor: ActivityActor;
  text: string;
  at: string;
  tone: ActivityTone;
}

/** Decision codes a printer — not the agent — is responsible for. */
const PRINTER_CODES = new Set([
  "QUOTE_RECEIVED",
  "PROVIDER_SILENT",
  "QUOTE_EXPIRED",
  "DECLINED",
  "MISSES_DEADLINE",
]);

/** Decision codes that describe the agent adapting after something went wrong. */
const RECOVERY_CODES = new Set(["MODEL_REPLAN", "CAPABILITIES_UNREADABLE", "QUOTE_REQUEST_FAILED"]);

/** Codes that stop or narrow the run — worth showing, in a "blocked" tone. */
const BLOCKED_CODES = new Set([
  "PROVIDER_SILENT",
  "QUOTE_EXPIRED",
  "DECLINED",
  "MISSES_DEADLINE",
  "PRICE_STALE",
  "PAYMENT_UNAVAILABLE",
  "NO_PROVIDERS",
  "NO_QUERYABLE_PROVIDER",
  "NO_QUOTES_RETURNED",
  "NO_USABLE_QUOTE",
  "NO_QUOTE_REQUESTS_ACCEPTED",
  "OFFER_LAPSED_BEFORE_APPROVAL",
  "OUT_OF_SCOPE",
  "CAPABILITIES_UNREADABLE",
]);

/**
 * Codes that are internal bookkeeping rather than something a buyer needs in a
 * narrative. They stay in the engineering trace.
 */
const HIDDEN_CODES = new Set([
  "PRICE_AGE",
  "AVAILABLE",
  "ENOUGH_QUOTES",
  "MODEL_FIELD_OVERRIDDEN",
  "MODEL_NORMALISED_DEADLINE",
  "MODEL_EXTRACTED_AREA",
  "MODEL_QUOTE_PLAN",
  "MODEL_TRADEOFF",
  "HUMAN_APPROVAL_REQUIRED",
  "APPROVED",
  // The recommendation gets its own card; repeating the whole sentence here is noise.
  "OFFER_SELECTED",
  "MODEL_OFFER_SELECTED",
]);

function actorFor(code: string): ActivityActor {
  if (PRINTER_CODES.has(code)) return "printer";
  return "agent";
}

function toneFor(code: string): ActivityTone {
  if (RECOVERY_CODES.has(code)) return "recovery";
  if (BLOCKED_CODES.has(code)) return "blocked";
  return "normal";
}

export interface ActivityInput {
  request: string;
  entries: TraceEntry[];
  /** Present once the buyer has decided. */
  decision: { outcome: "APPROVED" | "DECLINED"; at: string } | null;
  recommendedName: string | null;
}

/**
 * Build the buyer-facing narrative. Caps at a readable length, keeping the
 * first and most recent events (the middle of a long run is repetitive polling).
 */
export function buildActivity(input: ActivityInput, limit = 24): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const entry of input.entries) {
    switch (entry.kind) {
      case "run_started":
        items.push({
          actor: "you",
          at: entry.at,
          tone: "normal",
          text: `You asked: “${input.request.trim()}”`,
        });
        break;

      case "model_response":
        if (entry.label === "understand_intent") {
          items.push({
            actor: "agent",
            at: entry.at,
            tone: "normal",
            text: "Read your request and worked out the brief.",
          });
        }
        break;

      case "model_fallback":
        items.push({
          actor: "agent",
          at: entry.at,
          tone: "recovery",
          text: "Fell back to its own rules for that step.",
        });
        break;

      case "decision": {
        if (HIDDEN_CODES.has(entry.label)) break;
        const text = entry.detail?.trim();
        if (!text || looksTechnical(text)) break;
        items.push({
          actor: actorFor(entry.label),
          at: entry.at,
          tone: toneFor(entry.label),
          text,
        });
        break;
      }

      case "approval_requested":
        items.push({
          actor: "agent",
          at: entry.at,
          tone: "decision",
          text: `Recommended ${input.recommendedName ?? "an option"} and stopped for your decision.`,
        });
        break;

      case "approval_recorded":
        items.push({
          actor: "you",
          at: entry.at,
          tone: "decision",
          text: entry.label === "approved" ? "You approved it." : "You declined it.",
        });
        break;

      case "commitment":
        if (entry.label === "COMMITMENT_ATTESTED") {
          items.push({
            actor: "system",
            at: entry.at,
            tone: "normal",
            text: "Recorded the agreed price and terms, and prepared your order message.",
          });
        } else if (entry.label === "COMMITMENT_ATTESTATION_FAILED") {
          items.push({
            actor: "system",
            at: entry.at,
            tone: "recovery",
            text: "Your decision is safely recorded. One background record could not be written yet and will be retried.",
          });
        }
        break;

      default:
        break; // tool_*, state_changed, model_request/selection: engineering only
    }
  }

  // De-duplicate consecutive identical lines (repeated polls of the same state).
  const deduped = items.filter((item, i) => i === 0 || item.text !== items[i - 1].text);

  if (deduped.length <= limit) return deduped;
  const head = deduped.slice(0, 2);
  const tail = deduped.slice(-(limit - 2));
  return [...head, ...tail];
}

export const ACTOR_LABEL: Record<ActivityActor, string> = {
  you: "You",
  agent: "Agent",
  printer: "Printer",
  system: "Intra",
};
