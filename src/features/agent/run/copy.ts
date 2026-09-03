/**
 * Buyer-facing copy for outcomes the system reports in codes.
 *
 * The engineering trace keeps the exact code and message. This module is what a
 * person reads: what happened, in their terms, and what they can do next. An
 * unmapped code degrades to a plain, non-alarming sentence rather than leaking
 * `TOOL_TIMEOUT` or `SCHEMA_MISMATCH` onto the screen.
 */

export interface OutcomeCopy {
  title: string;
  body: string;
  /** What the buyer can do now. Null when there is nothing useful to offer. */
  recovery: string | null;
  /** True when the situation is expected and blameless rather than a failure. */
  benign: boolean;
}

const OUTCOMES: Record<string, OutcomeCopy> = {
  NO_PROVIDERS: {
    title: "No printers are live yet",
    body: "No verified printer is currently offering this service.",
    recovery: "Check back shortly, or ask an operator to activate a printer.",
    benign: true,
  },
  NO_QUERYABLE_PROVIDER: {
    title: "No printer can take this right now",
    body: "Every printer we found is either paused, working from prices too old to trust, or cannot take a paid request at the moment.",
    recovery: "Nothing was spent. Try again later, or with a different deadline.",
    benign: true,
  },
  NO_QUOTE_REQUESTS_ACCEPTED: {
    title: "No printer accepted the request",
    body: "The printers we found turned the request away before quoting.",
    recovery: "Try again shortly — availability changes through the day.",
    benign: true,
  },
  NO_QUOTES_RETURNED: {
    title: "Nobody replied in time",
    body: "The printers were asked but none answered inside the waiting window. Their requests are still open on their side.",
    recovery: "Run it again in a few minutes, or give a later deadline.",
    benign: true,
  },
  NO_USABLE_QUOTE: {
    title: "The quotes that came back cannot work",
    body: "Prices came in, but none of them fits this order — usually the deadline, or a quote that had already lapsed.",
    recovery: "Try a later deadline, or run it again for fresh prices.",
    benign: true,
  },
  OFFER_LAPSED_BEFORE_APPROVAL: {
    title: "The quote lapsed before you saw it",
    body: "Printers put a short expiry on a fixed price, and this one ran out before it could be shown to you.",
    recovery: "Run it again — the agent will ask for a fresh price.",
    benign: true,
  },
  OUT_OF_SCOPE: {
    title: "That is outside what this agent does",
    body: "This agent handles flyer, poster and leaflet printing only.",
    recovery: "Try describing a printing job instead.",
    benign: true,
  },
  DISCOVERY_FAILED: {
    title: "We could not load the printer list",
    body: "Something went wrong on our side while looking up printers.",
    recovery: "Try again — nothing was requested and nothing was spent.",
    benign: false,
  },
  TOOL_TIMEOUT: {
    title: "A printer did not respond in time",
    body: "One of the printers' systems did not answer.",
    recovery: "The agent can try a different printer.",
    benign: true,
  },
  TOOL_NETWORK_ERROR: {
    title: "We could not reach a printer",
    body: "The connection to one of the printers failed.",
    recovery: "The agent can try a different printer.",
    benign: true,
  },
};

const FALLBACK: OutcomeCopy = {
  title: "That did not go through",
  body: "Something went wrong while the agent was working. Nothing was ordered and no money moved.",
  recovery: "Try again.",
  benign: false,
};

/**
 * Human copy for a run outcome. `summary` is the run's own sentence, used when
 * the code is unknown but the sentence is already readable.
 */
export function outcomeCopy(code: string | null, summary?: string | null): OutcomeCopy {
  if (code && OUTCOMES[code]) return OUTCOMES[code];
  if (summary && summary.trim().length > 0 && !looksTechnical(summary)) {
    return { ...FALLBACK, body: summary.trim() };
  }
  return FALLBACK;
}

/** Codes and shapes that must never reach a buyer verbatim. */
const TECHNICAL =
  /(\bHTTP_\d{3}|\bECONN\w*|\bAbortError\b|\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b|\bundefined\b|\bnull\b|[{}]|<\/?[a-z]+>|\/(api|v1)\/)/;

export function looksTechnical(text: string): boolean {
  return TECHNICAL.test(text);
}

/** Buyer-facing copy for the errors the `/api/agent` surface can return. */
export interface RequestErrorCopy {
  title: string;
  body: string;
  /** When true the console should offer to start a fresh run. */
  offerRestart: boolean;
}

const REQUEST_ERRORS: Record<string, RequestErrorCopy> = {
  RUN_NOT_FOUND: {
    title: "This run has expired",
    body: "Runs are held for 30 minutes and are never saved. Your request text is still here.",
    offerRestart: true,
  },
  NOT_YOUR_RUN: {
    title: "This run belongs to another device",
    body: "A run can only be seen and approved on the device that started it.",
    offerRestart: true,
  },
  RUN_IN_PROGRESS: {
    title: "Still working",
    body: "The agent has not finished yet.",
    offerRestart: false,
  },
  NOT_AWAITING_APPROVAL: {
    title: "This is no longer waiting on you",
    body: "The run already moved on — it was decided, or it ended without a usable quote.",
    offerRestart: true,
  },
  APPROVAL_STALE: {
    title: "The quote changed",
    body: "The offer moved after it was shown to you, so that approval no longer applies. Review the current one.",
    offerRestart: false,
  },
  SESSION_REQUIRED: {
    title: "We could not identify this browser",
    body: "Your browser is blocking the local storage this demo uses to keep your request separate from other people's.",
    offerRestart: false,
  },
  NETWORK: {
    title: "Connection lost",
    body: "We could not reach the server. The agent keeps working in the background.",
    offerRestart: false,
  },
  INVALID_BODY: {
    title: "That request could not be read",
    body: "Try rephrasing what you need.",
    offerRestart: false,
  },
};

export function requestErrorCopy(code: string | null | undefined): RequestErrorCopy {
  if (code && REQUEST_ERRORS[code]) return REQUEST_ERRORS[code];
  return {
    title: "Something went wrong",
    body: "We could not complete that. Nothing was ordered and no money moved.",
    offerRestart: false,
  };
}
