import type { AgentRunState } from "../state";
import type { AgentRunStatus } from "./store";

/**
 * The semantic progress spine the buyer actually sees.
 *
 * The internal state machine has thirteen states named for the mechanism
 * (READING_CAPABILITIES, AWAITING_QUOTES…). A buyer does not need to know any
 * of them — they need to know what is happening to their request. This module
 * is the single place that translation lives, so the UI stays a renderer and
 * the mapping is testable.
 *
 * Labels are written in the tense that matches the status: "Finding printers…"
 * while it is happening, "Found 3 printers" once it has.
 */

export type StageKey =
  "understand" | "discover" | "check" | "quote" | "compare" | "decide" | "record";

export type StageStatus =
  | "pending" // not reached yet
  | "active" // the agent is doing this now
  | "waiting" // the agent is waiting on someone else (a human printer)
  | "done" // finished successfully
  | "blocked" // the run stopped here
  | "needs-you" // the run is paused for a human
  | "skipped"; // never happened, and never will on this run

export interface RunStage {
  key: StageKey;
  label: string;
  status: StageStatus;
  /** Extra sentence shown under the label when there is something real to say. */
  detail: string | null;
}

export const STAGE_ORDER: readonly StageKey[] = [
  "understand",
  "discover",
  "check",
  "quote",
  "compare",
  "decide",
  "record",
];

/** Which stage an internal state belongs to. */
const STATE_STAGE: Record<AgentRunState, StageKey> = {
  CREATED: "understand",
  CLARIFICATION_NEEDED: "understand",
  DISCOVERING: "discover",
  READING_CAPABILITIES: "check",
  PLANNING: "check",
  REQUESTING_QUOTES: "quote",
  AWAITING_QUOTES: "quote",
  COMPARING: "compare",
  AWAITING_APPROVAL: "decide",
  APPROVED: "record",
  DECLINED: "decide",
  // Terminal failures are never placed by name — see `reachedIndex`.
  NO_VIABLE_OFFER: "compare",
  FAILED: "understand",
};

/**
 * Where a failed run actually stopped.
 *
 * The state name is useless here: NO_VIABLE_OFFER is reported whether nobody
 * replied (stopped at "quote") or the replies were unusable (stopped at
 * "compare"). What the buyer is told must match what actually happened, so this
 * reads the counters instead.
 */
function terminalStage(input: StageInput): StageKey {
  if (input.failureCode === "OUT_OF_SCOPE") return "understand";
  if (input.quotesReceived > 0) return "compare";
  if (input.quotesRequested > 0) return "quote";
  if (input.providersFound > 0) return "check";
  return "discover";
}

export interface StageInput {
  /** The internal state, when the run has reported one. */
  agentState: AgentRunState | null;
  status: AgentRunStatus;
  providersFound: number;
  quotesRequested: number;
  quotesReceived: number;
  /** Quoted providers whose answer could not be used (expired, declined, too slow). */
  unusableQuotes: number;
  /** Providers ruled out before any quote request was sent. */
  ruledOutBeforeQuoting: number;
  hasRecommendation: boolean;
  recommendedName: string | null;
  clarificationNeeded: boolean;
  decision: "APPROVED" | "DECLINED" | null;
  commitmentRecorded: boolean;
  /** True when the agent went back and asked a further provider. */
  replanned: boolean;
  /** The code the run stopped on, when it stopped without a recommendation. */
  failureCode?: string | null;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

const TERMINAL_FAILURE: readonly AgentRunStatus[] = ["NO_VIABLE_OFFER", "FAILED"];

/** How far the run actually got, as an index into STAGE_ORDER. */
function reachedIndex(input: StageInput): number {
  if (TERMINAL_FAILURE.includes(input.status)) {
    return STAGE_ORDER.indexOf(terminalStage(input));
  }
  let index = input.agentState ? STAGE_ORDER.indexOf(STATE_STAGE[input.agentState]) : 0;
  // Counters are more trustworthy than the state name for a terminal run: a
  // FAILED run that already collected quotes failed at `compare`, not `understand`.
  if (input.providersFound > 0) index = Math.max(index, STAGE_ORDER.indexOf("check"));
  if (input.quotesRequested > 0) index = Math.max(index, STAGE_ORDER.indexOf("quote"));
  if (input.quotesReceived > 0) index = Math.max(index, STAGE_ORDER.indexOf("compare"));
  if (input.hasRecommendation) index = Math.max(index, STAGE_ORDER.indexOf("decide"));
  if (input.decision) index = Math.max(index, STAGE_ORDER.indexOf("record"));
  return Math.max(0, index);
}

/** A stage that never ran reads in the infinitive, not the progressive. */
const notStarted = (status: StageStatus): boolean => status === "pending" || status === "skipped";

function labelFor(key: StageKey, status: StageStatus, input: StageInput): string {
  const waitingOn = Math.max(0, input.quotesRequested - input.quotesReceived);

  switch (key) {
    case "understand":
      if (status === "needs-you") return "I need a little more detail";
      if (status === "blocked") return "I can't take this one on";
      return status === "done" ? "Understood your request" : "Understanding your request";

    case "discover":
      if (status === "blocked") return "No printer is offering this right now";
      if (status === "done") {
        const n = input.providersFound;
        return `Found ${n} ${plural(n, "printer", "printers")} who ${plural(n, "offers", "offer")} this`;
      }
      return notStarted(status)
        ? "Find printers who can do this"
        : "Finding printers who can do this";

    case "check":
      if (status === "blocked") return "None of them can take the job right now";
      if (status === "done") {
        return input.quotesRequested > 0
          ? `${input.quotesRequested} of ${input.providersFound} can take it on today`
          : "Checked who is available";
      }
      return notStarted(status) ? "Check who is available now" : "Checking who is available now";

    case "quote":
      if (status === "blocked") return "No printer replied in time";
      if (status === "waiting") {
        return `Waiting for ${waitingOn} ${plural(waitingOn, "printer", "printers")} to reply`;
      }
      if (status === "done") {
        return `${input.quotesReceived} ${plural(input.quotesReceived, "quote", "quotes")} came back`;
      }
      return notStarted(status) ? "Ask for current prices" : "Asking for current prices";

    case "compare":
      if (status === "blocked") return "None of the quotes work for this order";
      if (status === "done") {
        return `Compared ${input.quotesReceived} ${plural(input.quotesReceived, "quote", "quotes")}`;
      }
      return notStarted(status) ? "Compare the options" : "Comparing the options";

    case "decide":
      if (status === "needs-you") return "Your decision";
      if (input.decision === "APPROVED") {
        return `You approved ${input.recommendedName ?? "the recommendation"}`;
      }
      if (input.decision === "DECLINED") return "You declined";
      if (status === "skipped") return "Your decision";
      return "Your decision";

    case "record":
      if (status === "done") return "Decision recorded and your order message is ready";
      if (status === "skipped") return "Nothing to record";
      return status === "active" ? "Recording your decision" : "Record your decision";
  }
}

function detailFor(key: StageKey, status: StageStatus, input: StageInput): string | null {
  if (key === "check" && status === "done" && input.ruledOutBeforeQuoting > 0) {
    const n = input.ruledOutBeforeQuoting;
    return `${n} ${plural(n, "was", "were")} ruled out before asking, so no fee was spent on ${plural(n, "it", "them")}.`;
  }
  if (key === "quote" && status === "waiting") {
    return "Printers answer as people, not APIs — this part is genuinely asynchronous.";
  }
  if (key === "quote" && status === "done" && input.replanned) {
    return "One printer did not work out, so the agent asked another.";
  }
  if (key === "compare" && status === "done" && input.unusableQuotes > 0) {
    const n = input.unusableQuotes;
    return `${n} ${plural(n, "quote was", "quotes were")} ruled out as unusable.`;
  }
  if (key === "decide" && status === "needs-you") {
    return "Nothing is ordered and no money moves until you approve.";
  }
  return null;
}

/**
 * Build the buyer-facing progress spine. Pure — same input, same output.
 */
export function buildStages(input: StageInput): RunStage[] {
  const reached = reachedIndex(input);
  const failed = TERMINAL_FAILURE.includes(input.status);
  const declined = input.decision === "DECLINED";

  return STAGE_ORDER.map((key, index) => {
    let status: StageStatus;

    if (key === "record") {
      // Only meaningful once a decision exists.
      if (input.decision === "APPROVED") status = input.commitmentRecorded ? "done" : "active";
      else if (declined || failed || input.clarificationNeeded) status = "skipped";
      else status = "pending";
    } else if (key === "decide") {
      if (input.decision) status = "done";
      else if (input.status === "AWAITING_APPROVAL") status = "needs-you";
      else if (failed || input.clarificationNeeded) status = "skipped";
      else status = index < reached ? "done" : index === reached ? "active" : "pending";
    } else if (index < reached) {
      status = "done";
    } else if (index > reached) {
      status = failed || input.clarificationNeeded ? "skipped" : "pending";
    } else if (input.clarificationNeeded && key === "understand") {
      status = "needs-you";
    } else if (failed) {
      status = "blocked";
    } else if (input.agentState === "AWAITING_QUOTES" && key === "quote") {
      status = input.quotesReceived >= input.quotesRequested ? "done" : "waiting";
    } else if (input.status === "RUNNING") {
      status = "active";
    } else {
      status = "done";
    }

    return {
      key,
      status,
      label: labelFor(key, status, input),
      detail: detailFor(key, status, input),
    };
  });
}

/** The one line to announce to a screen reader / show as the headline. */
export function currentStageLine(stages: RunStage[]): string {
  const live = stages.find(
    (s) =>
      s.status === "active" ||
      s.status === "waiting" ||
      s.status === "needs-you" ||
      s.status === "blocked",
  );
  if (live) return live.label;
  const lastDone = [...stages].reverse().find((s) => s.status === "done");
  return lastDone?.label ?? "Getting started";
}
