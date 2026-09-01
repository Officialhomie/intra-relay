/**
 * Buyer-agent run lifecycle.
 *
 * Deliberately mirrors the *real* shape of the transaction rather than an
 * idealised one: quotes come back from humans asynchronously, so the run has a
 * genuine waiting state and can legitimately end without a purchase.
 */
export const AGENT_RUN_STATES = [
  "CREATED",
  "DISCOVERING", // listing providers for the route
  "READING_CAPABILITIES", // fetching capability documents
  "PLANNING", // deciding who to query, and whether the fee is worth it
  "REQUESTING_QUOTES", // posting quote requests (may involve x402)
  "AWAITING_QUOTES", // humans have not answered yet — a real, expected state
  "COMPARING", // scoring the offers that came back
  "AWAITING_APPROVAL", // recommendation made; the human must decide (BR-001)
  "APPROVED", // human approved; handoff can be prepared
  "DECLINED", // human declined
  "NO_VIABLE_OFFER", // ran cleanly, nothing usable came back
  "FAILED",
] as const;

export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

/** States from which the run will never move again. */
export const TERMINAL_AGENT_RUN_STATES: readonly AgentRunState[] = [
  "APPROVED",
  "DECLINED",
  "NO_VIABLE_OFFER",
  "FAILED",
];

const ALLOWED: Record<AgentRunState, readonly AgentRunState[]> = {
  CREATED: ["DISCOVERING", "FAILED"],
  DISCOVERING: ["READING_CAPABILITIES", "NO_VIABLE_OFFER", "FAILED"],
  READING_CAPABILITIES: ["PLANNING", "NO_VIABLE_OFFER", "FAILED"],
  PLANNING: ["REQUESTING_QUOTES", "NO_VIABLE_OFFER", "FAILED"],
  REQUESTING_QUOTES: ["AWAITING_QUOTES", "COMPARING", "NO_VIABLE_OFFER", "FAILED"],
  // A run may loop back to planning when every quote expired or was declined —
  // that is the ADAPT edge, and it must be explicit rather than a silent retry.
  AWAITING_QUOTES: ["COMPARING", "PLANNING", "NO_VIABLE_OFFER", "FAILED"],
  COMPARING: ["AWAITING_APPROVAL", "PLANNING", "NO_VIABLE_OFFER", "FAILED"],
  AWAITING_APPROVAL: ["APPROVED", "DECLINED", "COMPARING", "NO_VIABLE_OFFER", "FAILED"],
  APPROVED: [],
  DECLINED: [],
  NO_VIABLE_OFFER: [],
  FAILED: [],
};

export function canTransition(from: AgentRunState, to: AgentRunState): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(state: AgentRunState): boolean {
  return TERMINAL_AGENT_RUN_STATES.includes(state);
}

export class AgentStateError extends Error {
  constructor(
    readonly from: AgentRunState,
    readonly to: AgentRunState,
  ) {
    super(`Illegal agent run transition ${from} -> ${to}.`);
    this.name = "AgentStateError";
  }
}

export function assertTransition(from: AgentRunState, to: AgentRunState): void {
  if (!canTransition(from, to)) throw new AgentStateError(from, to);
}
