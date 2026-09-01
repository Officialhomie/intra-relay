import { AGENT_TOOLS, type ToolContext, type ToolResult } from "../tools/registry";
import { planCandidates, type CandidatePlan } from "../policy/candidates";
import { selectOffer, type OfferSelection } from "../policy/offers";
import {
  approvalReason,
  buildApprovalCard,
  evaluateApproval,
  type ApprovalCard,
} from "../policy/approval";
import { assertTransition, isTerminal, type AgentRunState } from "../state";
import { AgentTrace } from "../trace";
import type { BuyerIntent, DecisionReason, ProviderCandidate, ProviderOffer } from "../types";
import { briefFromIntent, missingBriefFields, parseBuyerIntent } from "./intent";

/**
 * The buyer-agent loop.
 *
 *   PERCEIVE  discover providers, read capability documents
 *   REASON    is this state trustworthy? is a query fee worth paying?
 *   PLAN      who to query, in what order, when to stop
 *   ACT       post quote requests through the public API
 *   OBSERVE   poll for human answers, watch expiry and silence
 *   VERIFY    re-check the chosen offer is still valid before showing it
 *   ADAPT     re-plan when quotes expire, are declined, or never arrive
 *
 * The loop stops at AWAITING_APPROVAL. It has no path to a purchase, because
 * there is no tool that performs one (BR-001).
 */

export interface AgentRunOptions {
  routeSlug?: string;
  maxProviders?: number;
  maxQueryFeeUsd?: number;
  /** How long to wait for human printers to answer, in ms. */
  quoteWaitMs?: number;
  /** Gap between polls, in ms. */
  pollIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface AgentRunResult {
  runId: string;
  state: AgentRunState;
  intent: BuyerIntent;
  candidates: ProviderCandidate[];
  plan: CandidatePlan | null;
  offers: ProviderOffer[];
  selection: OfferSelection | null;
  approvalCard: ApprovalCard | null;
  summary: string;
  reasons: DecisionReason[];
  trace: ReturnType<AgentTrace["toJSON"]>;
}

const DEFAULTS = {
  routeSlug: "flyer-printing",
  maxProviders: 3,
  quoteWaitMs: 90_000,
  pollIntervalMs: 5_000,
};

class Run {
  state: AgentRunState = "CREATED";
  readonly reasons: DecisionReason[] = [];

  constructor(readonly trace: AgentTrace) {}

  to(next: AgentRunState): void {
    assertTransition(this.state, next);
    this.trace.stateChanged(this.state, next);
    this.state = next;
  }

  reason(reason: DecisionReason): void {
    this.reasons.push(reason);
    this.trace.decision(reason);
  }

  reasonAll(reasons: DecisionReason[]): void {
    for (const item of reasons) this.reason(item);
  }
}

async function callTool<I, O>(
  tool: { name: string; run(input: I, ctx: ToolContext): Promise<ToolResult<O>> },
  input: I,
  ctx: ToolContext,
  trace: AgentTrace,
): Promise<ToolResult<O>> {
  const started = Date.now();
  trace.toolCalled(tool.name, input);
  try {
    const result = await tool.run(input, ctx);
    const ms = Date.now() - started;
    if (result.ok) trace.toolResult(tool.name, result.data, ms);
    else trace.toolFailed(tool.name, result.errorCode ?? "UNKNOWN", result.errorMessage ?? "", ms);
    return result;
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? error.message : "Unknown tool failure.";
    trace.toolFailed(tool.name, "TOOL_EXCEPTION", message, ms);
    return { ok: false, data: null, errorCode: "TOOL_EXCEPTION", errorMessage: message };
  }
}

export async function runBuyerAgent(
  request: string,
  ctx: ToolContext,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const routeSlug = options.routeSlug ?? DEFAULTS.routeSlug;
  const maxProviders = options.maxProviders ?? DEFAULTS.maxProviders;
  const quoteWaitMs = options.quoteWaitMs ?? DEFAULTS.quoteWaitMs;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULTS.pollIntervalMs;

  const trace = new AgentTrace(request);
  const run = new Run(trace);
  const intent = parseBuyerIntent(request, { now: now(), maxQueryFeeUsd: options.maxQueryFeeUsd });

  let candidates: ProviderCandidate[] = [];
  let plan: CandidatePlan | null = null;
  let offers: ProviderOffer[] = [];
  let selection: OfferSelection | null = null;

  const finish = (summary: string): AgentRunResult => {
    trace.finished(run.state, summary);
    return {
      runId: trace.runId,
      state: run.state,
      intent,
      candidates,
      plan,
      offers,
      selection,
      approvalCard: selection ? buildApprovalCard(selection) : null,
      summary,
      reasons: run.reasons,
      trace: trace.toJSON(),
    };
  };

  const bail = (state: AgentRunState, reason: DecisionReason): AgentRunResult => {
    run.reason(reason);
    run.to(state);
    return finish(reason.statement);
  };

  // A brief the printer cannot price is not worth anyone's time or fee.
  const missing = missingBriefFields(intent);
  if (missing.length > 0) {
    return bail("FAILED", {
      code: "INCOMPLETE_BRIEF",
      statement: `Cannot request a quote yet — the request does not say: ${missing.join(", ")}.`,
    });
  }

  // --- PERCEIVE: discover -------------------------------------------------
  run.to("DISCOVERING");
  const discovered = await callTool(
    AGENT_TOOLS.discoverProviders,
    { routeSlug },
    ctx,
    trace,
  );
  if (!discovered.ok) {
    return bail("FAILED", {
      code: discovered.errorCode ?? "DISCOVERY_FAILED",
      statement: `Could not list providers: ${discovered.errorMessage}`,
    });
  }
  candidates = discovered.data ?? [];
  if (candidates.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_PROVIDERS",
      statement: `No provider publishes an active "${routeSlug}" route right now.`,
    });
  }
  run.reason({
    code: "PROVIDERS_FOUND",
    statement: `Found ${candidates.length} provider${candidates.length === 1 ? "" : "s"} offering ${routeSlug}.`,
  });

  // --- PERCEIVE: read capability documents --------------------------------
  run.to("READING_CAPABILITIES");
  const enriched: ProviderCandidate[] = [];
  for (const candidate of candidates) {
    const doc = await callTool(
      AGENT_TOOLS.getBusinessCapabilities,
      { businessSlug: candidate.businessSlug, routeSlug },
      ctx,
      trace,
    );
    if (doc.ok && doc.data) {
      // Discovery knows the currency; the capability document knows availability.
      enriched.push({ ...doc.data, quoteCurrency: candidate.quoteCurrency });
    } else {
      run.reason({
        code: "CAPABILITIES_UNREADABLE",
        statement: `Could not read ${candidate.businessName}'s capability document (${doc.errorCode}), so it is excluded.`,
      });
    }
  }
  candidates = enriched;

  // --- REASON + PLAN ------------------------------------------------------
  run.to("PLANNING");
  plan = planCandidates(candidates, {
    budgetUsd: intent.maxQueryFeeUsd,
    maxProviders,
    now: now(),
  });
  run.reasonAll(plan.notes);
  for (const skipped of plan.skipped) run.reasonAll(skipped.disqualifiers);

  if (plan.toQuery.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUERYABLE_PROVIDER",
      statement:
        "Every provider was excluded before any fee was spent — none is available, fresh and payable right now.",
    });
  }

  // --- ACT: request quotes ------------------------------------------------
  run.to("REQUESTING_QUOTES");
  const brief = briefFromIntent(intent);
  const pending: { taskId: string; businessName: string }[] = [];

  for (const item of plan.toQuery) {
    const accepted = await callTool(
      AGENT_TOOLS.requestQuote,
      { businessSlug: item.candidate.businessSlug, routeSlug, brief },
      ctx,
      trace,
    );
    if (!accepted.ok || !accepted.data) {
      run.reason({
        code: accepted.errorCode ?? "QUOTE_REQUEST_FAILED",
        statement: `${item.candidate.businessName} did not accept the quote request: ${accepted.errorMessage}`,
      });
      continue;
    }
    pending.push({ taskId: accepted.data.taskId, businessName: item.candidate.businessName });
    run.reason({
      code: "QUOTE_REQUESTED",
      statement:
        `Asked ${item.candidate.businessName} for a price` +
        (item.feeUsd > 0 ? ` for a $${item.feeUsd.toFixed(3)} query fee.` : " (no query fee).") +
        (accepted.data.responseSlaMinutes
          ? ` They answer within ${accepted.data.responseSlaMinutes} minutes.`
          : ""),
    });
  }

  if (pending.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUOTE_REQUESTS_ACCEPTED",
      statement: "No provider accepted a quote request.",
    });
  }

  // --- OBSERVE: wait for humans -------------------------------------------
  run.to("AWAITING_QUOTES");
  run.reason({
    code: "AWAITING_HUMANS",
    statement: `Waiting for ${pending.length} human printer${pending.length === 1 ? "" : "s"} to answer. This is asynchronous by nature.`,
  });

  const deadline = now().getTime() + quoteWaitMs;
  const answered = new Map<string, ProviderOffer>();

  while (answered.size < pending.length && now().getTime() < deadline) {
    for (const item of pending) {
      if (answered.has(item.taskId)) continue;
      const status = await callTool(
        AGENT_TOOLS.getQuoteStatus,
        { taskId: item.taskId },
        ctx,
        trace,
      );
      if (status.ok && status.data?.offer) {
        answered.set(item.taskId, status.data.offer);
        run.reason({
          code: "QUOTE_RECEIVED",
          statement: `${item.businessName} answered with a ${status.data.offer.status.toLowerCase()} quote.`,
        });
      }
    }
    if (answered.size < pending.length && now().getTime() < deadline) {
      await sleep(pollIntervalMs);
    }
  }

  for (const item of pending) {
    if (!answered.has(item.taskId)) {
      run.reason({
        code: "PROVIDER_SILENT",
        statement: `${item.businessName} had not answered within the wait window, so their quote is not in the comparison.`,
      });
    }
  }

  offers = [...answered.values()];
  if (offers.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUOTES_RETURNED",
      statement: `No printer answered within ${Math.round(quoteWaitMs / 1000)}s. Their requests remain open — check back, or ask a different printer.`,
    });
  }

  // --- REASON: compare ----------------------------------------------------
  run.to("COMPARING");
  selection = selectOffer(offers, intent, now());
  for (const scored of selection.ranked) {
    run.reasonAll(scored.disqualifiers);
  }

  if (!selection.selected) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_USABLE_QUOTE",
      statement: selection.selectionReason,
    });
  }

  // --- VERIFY: is the winner still valid at the moment we show it? --------
  const recheck = selectOffer(offers, intent, now());
  if (!recheck.selected) {
    return bail("NO_VIABLE_OFFER", {
      code: "OFFER_LAPSED_BEFORE_APPROVAL",
      statement: `The preferred quote lapsed before it could be shown. ${recheck.selectionReason}`,
    });
  }
  selection = recheck;

  run.reason({ code: "OFFER_SELECTED", statement: selection.selectionReason });

  // --- Stop at the human ---------------------------------------------------
  run.to("AWAITING_APPROVAL");
  const gate = evaluateApproval(selection, null, intent);
  const gateReason = approvalReason(gate);
  run.reason(gateReason);
  if (gate.card) trace.approvalRequested(gate.card.offerFingerprint, gate.card.selectionReason);

  return finish(selection.selectionReason);
}

export interface ApprovalSubmission {
  granted: boolean;
  offerFingerprint: string;
  reason?: string;
}

/**
 * Applies a human's decision to a completed run. Separate from `runBuyerAgent`
 * on purpose: approval is an act by a person at a later time, not a step the
 * loop can take on its own.
 */
export async function submitApproval(
  result: AgentRunResult,
  submission: ApprovalSubmission,
  ctx: ToolContext,
): Promise<AgentRunResult> {
  const trace = new AgentTrace(result.intent.raw, result.runId);
  if (result.state !== "AWAITING_APPROVAL" || !result.selection) {
    return {
      ...result,
      summary: "This run is not waiting for approval.",
      reasons: [
        ...result.reasons,
        { code: "NOT_AWAITING_APPROVAL", statement: "This run is not waiting for approval." },
      ],
    };
  }

  const gate = evaluateApproval(result.selection, submission);
  trace.approvalRecorded(submission.granted, submission.offerFingerprint);

  if (!gate.allowed) {
    const reason = approvalReason(gate);
    // A declined offer is a legitimate outcome, not a failure.
    if (submission.granted === false && gate.card) {
      const declined = await callTool(
        AGENT_TOOLS.recordBuyerDecision,
        { taskId: gate.card.taskId, decision: "DECLINE" as const, reason: submission.reason },
        ctx,
        trace,
      );
      return {
        ...result,
        state: "DECLINED",
        summary: declined.ok
          ? "The buyer declined the quote."
          : `The buyer declined, but recording it failed: ${declined.errorMessage}`,
        reasons: [...result.reasons, { code: "DECLINED", statement: "The buyer declined." }],
        trace: trace.toJSON(),
      };
    }
    return {
      ...result,
      summary: reason.statement,
      reasons: [...result.reasons, reason],
      trace: trace.toJSON(),
    };
  }

  const recorded = await callTool(
    AGENT_TOOLS.recordBuyerDecision,
    { taskId: gate.card.taskId, decision: "ACCEPT" as const },
    ctx,
    trace,
  );
  if (!recorded.ok) {
    return {
      ...result,
      summary: `Approved, but recording the decision failed: ${recorded.errorMessage}`,
      reasons: [
        ...result.reasons,
        { code: recorded.errorCode ?? "DECISION_FAILED", statement: recorded.errorMessage ?? "" },
      ],
      trace: trace.toJSON(),
    };
  }

  return {
    ...result,
    state: "APPROVED",
    summary: `Approved: ${gate.card.businessName} at ${gate.card.price}. ${gate.card.finalOrderStatement}`,
    reasons: [...result.reasons, approvalReason(gate)],
    trace: trace.toJSON(),
  };
}

export { isTerminal };
