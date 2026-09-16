import { AGENT_TOOLS, type ToolContext, type ToolResult } from "../tools/registry";
import { planCandidates, type CandidateAssessment, type CandidatePlan } from "../policy/candidates";
import {
  authoritativeExclusion,
  evaluateCandidate,
  summarizeForTrace,
  type DiscoveryCriteria,
} from "../policy/evaluation";
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
import {
  applyBriefCorrection,
  briefFromIntent,
  describeMissingFields,
  isBuyerReadableQuestion,
  missingBriefFields,
  parseBuyerIntent,
  type BriefCorrection,
} from "./intent";

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
  /**
   * A buyer's correction to the agent's reading of their request. Applied AFTER
   * the model hook, because a human looking at the summary and fixing it
   * outranks every automatic interpretation.
   */
  briefCorrection?: BriefCorrection;
  /** Called at each milestone so a caller can show a live view of the run. */
  onProgress?: (snapshot: AgentRunProgress) => void;
  /**
   * Optional model-backed decision points (milestone 3). Each hook may return
   * `null` to defer to the deterministic behaviour; the loop's safety rails
   * (budget, expiry, eligibility, approval) apply either way.
   */
  hooks?: AgentRunHooks;
}

export interface AgentHookContext {
  request: string;
  now: Date;
  trace: AgentTrace;
}

export interface RefineIntentResult {
  intent: BuyerIntent;
  clarification: { question: string; missing: string[] } | null;
  outOfScope: string | null;
  notes: DecisionReason[];
}

export interface PlanQuotesResult {
  /** An ordered subset of the allowed assessments the loop passed in. */
  order: CandidateAssessment[];
  notes: DecisionReason[];
}

export interface ChooseOfferResult {
  selectedBusinessSlug: string;
  reason: string;
  tradeoffs: string[];
  uncertainties: string[];
  notes: DecisionReason[];
}

export interface ReplanHookInput {
  reasonUnusable: string;
  unanswered: CandidateAssessment[];
  budgetRemainingUsd: number;
  answered: Pick<ProviderOffer, "businessSlug" | "status">[];
}

export interface ReplanResult {
  /** A subset of `unanswered` to request fresh quotes from. Empty = stop. */
  requote: CandidateAssessment[];
  reason: string;
  notes: DecisionReason[];
}

export interface AgentRunHooks {
  refineIntent?(
    deterministic: BuyerIntent,
    ctx: AgentHookContext,
  ): Promise<RefineIntentResult | null>;
  planQuotes?(
    allowed: CandidateAssessment[],
    plan: CandidatePlan,
    intent: BuyerIntent,
    ctx: AgentHookContext,
  ): Promise<PlanQuotesResult | null>;
  chooseOffer?(
    selection: OfferSelection,
    intent: BuyerIntent,
    ctx: AgentHookContext,
  ): Promise<ChooseOfferResult | null>;
  replan?(input: ReplanHookInput, ctx: AgentHookContext): Promise<ReplanResult | null>;
}

export interface AgentRunProgress {
  state: AgentRunState;
  intent: BuyerIntent;
  candidatesFound: number;
  requestedQuotes: RequestedQuote[];
  offersReceived: number;
  reasons: DecisionReason[];
  trace: ReturnType<AgentTrace["toJSON"]>;
}

export interface AgentRunResult {
  runId: string;
  state: AgentRunState;
  intent: BuyerIntent;
  candidates: ProviderCandidate[];
  plan: CandidatePlan | null;
  offers: ProviderOffer[];
  /** The quote requests the agent actually posted (taskId per provider). */
  requestedQuotes: RequestedQuote[];
  selection: OfferSelection | null;
  approvalCard: ApprovalCard | null;
  summary: string;
  reasons: DecisionReason[];
  /**
   * Set when the run stopped because a required brief field is missing. The
   * question may be model-phrased; whether one is needed is always decided
   * deterministically by `missingBriefFields`.
   */
  clarification: { question: string; missing: string[] } | null;
  /** Set once an approved run has produced a commitment (milestone 2). */
  commitment: AgentCommitmentView | null;
  trace: ReturnType<AgentTrace["toJSON"]>;
}

/**
 * What the agent layer knows about a commitment: an outcome, not a mechanism.
 * The agent never sees EAS, a schema UID, a signer, or a chain. Note `simulated`
 * — a mock result must never read as an on-chain fact.
 */
export interface RequestedQuote {
  taskId: string;
  businessSlug: string;
  businessName: string;
}

export interface AgentCommitmentView {
  status: string;
  jobRef: string;
  handoverCommit: string;
  validUntil: string;
  attestationUid: string | null;
  attestationTxHash: string | null;
  mode: string | null;
  simulated: boolean;
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

/**
 * Map the already-parsed `BuyerIntent` onto the evaluation foundation's
 * criteria shape (M10.9). Every field here already exists on `BuyerIntent` —
 * nothing is re-parsed from raw text, and nothing is invented for a field the
 * buyer never stated (an absent criterion is simply omitted, per
 * `DiscoveryCriteria`'s own contract). Quantity and product/service subtype
 * are intentionally NOT included: `evaluateCandidate` has no minimum-order or
 * productType constraint yet (out of scope this milestone), so passing them
 * would be a value with no consumer.
 */
function criteriaFromIntent(intent: BuyerIntent): DiscoveryCriteria {
  return {
    location: intent.deliveryArea,
    fulfillmentPreference: intent.fulfillmentPreference,
    deadlineIso: intent.deadline,
    productType: intent.productType,
    quantity: intent.quantity,
  };
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
  const hooks = options.hooks ?? {};
  const hookCtx = (): AgentHookContext => ({ request, now: now(), trace });
  let intent = parseBuyerIntent(request, { now: now(), maxQueryFeeUsd: options.maxQueryFeeUsd });

  let candidates: ProviderCandidate[] = [];
  let plan: CandidatePlan | null = null;
  let offers: ProviderOffer[] = [];
  let requestedQuotes: RequestedQuote[] = [];
  let selection: OfferSelection | null = null;
  let clarification: AgentRunResult["clarification"] = null;

  const finish = (summary: string): AgentRunResult => {
    trace.finished(run.state, summary);
    return {
      runId: trace.runId,
      state: run.state,
      intent,
      candidates,
      plan,
      offers,
      requestedQuotes,
      selection,
      approvalCard: selection ? buildApprovalCard(selection) : null,
      summary,
      reasons: run.reasons,
      clarification,
      commitment: null,
      trace: trace.toJSON(),
    };
  };

  const bail = (state: AgentRunState, reason: DecisionReason): AgentRunResult => {
    run.reason(reason);
    run.to(state);
    return finish(reason.statement);
  };

  const emit = (): void => {
    options.onProgress?.({
      state: run.state,
      intent,
      candidatesFound: candidates.length,
      requestedQuotes,
      offersReceived: offers.length,
      reasons: run.reasons,
      trace: trace.toJSON(),
    });
  };

  // --- REASON: understand the request (model, with a deterministic fallback) ---
  let modelQuestion: string | null = null;
  if (hooks.refineIntent) {
    try {
      const refined = await hooks.refineIntent(intent, hookCtx());
      if (refined) {
        intent = refined.intent;
        run.reasonAll(refined.notes);
        if (refined.outOfScope) {
          return bail("FAILED", { code: "OUT_OF_SCOPE", statement: refined.outOfScope });
        }
        // The model phrases the question; this decides whether it is fit to
        // show. A question that names internal field identifiers is not.
        const proposed = refined.clarification?.question ?? null;
        modelQuestion = proposed && isBuyerReadableQuestion(proposed) ? proposed : null;
        if (proposed && !modelQuestion) {
          trace.modelFallback(
            "understand_intent",
            "QUESTION_NOT_READABLE",
            "used our own phrasing",
          );
        }
      }
    } catch {
      // A failing refinement never blocks the run — fall through to the parse.
      trace.modelFallback("understand_intent", "HOOK_ERROR", "kept the deterministic parse");
    }
  }

  // A human correction outranks both the parser and the model: the buyer read
  // the summary and fixed it. It is applied last, and can itself supply the
  // detail the agent was about to ask for.
  if (options.briefCorrection) {
    const corrected = applyBriefCorrection(intent, options.briefCorrection);
    intent = corrected.intent;
    if (corrected.changed.length > 0) {
      run.reason({
        code: "HUMAN_CORRECTED",
        statement: `You corrected the ${corrected.changed.join(", ")}, so the agent used your value.`,
      });
    }
  }

  emit();

  // A brief the printer cannot price is not worth anyone's time or fee. This is
  // the deterministic gate: the model may PHRASE the question, but only this
  // decides whether one is actually needed.
  const missing = missingBriefFields(intent);
  if (missing.length > 0) {
    const question = modelQuestion ?? describeMissingFields(missing);
    clarification = { question, missing };
    run.reason({ code: "CLARIFICATION_NEEDED", statement: question });
    run.to("CLARIFICATION_NEEDED");
    return finish(question);
  }

  // --- PERCEIVE: discover -------------------------------------------------
  run.to("DISCOVERING");
  const discovered = await callTool(AGENT_TOOLS.discoverProviders, { routeSlug }, ctx, trace);
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
      statement: "No printer is offering this service right now.",
    });
  }
  run.reason({
    code: "PROVIDERS_FOUND",
    statement: `Found ${candidates.length} printer${candidates.length === 1 ? "" : "s"} who can do this job.`,
  });
  emit();

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
        statement: `We could not reach ${candidate.businessName} to check availability, so it was left out.`,
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

  // --- REASON: explicit, safe evaluation gate (M10.11) ---------------------
  // CandidateAssessment remains the authority for availability, freshness,
  // verification and fee policy. Evaluation adds exactly one new gate: an
  // explicit false for the fulfilment method the buyer requested. UNKNOWN,
  // location and typical turnaround remain advisory and cannot alter toQuery.
  const assessedBySlug = new Map(plan.assessed.map((a) => [a.candidate.businessSlug, a]));
  const criteria = criteriaFromIntent(intent);
  const excludedByEvaluation = new Set<string>();
  for (const candidate of candidates) {
    const evaluation = evaluateCandidate(candidate, criteria, now());
    const assessment = assessedBySlug.get(candidate.businessSlug);
    const queryable = assessment?.queryable ?? false;
    const exclusion = authoritativeExclusion(evaluation);
    const gated = queryable && exclusion !== null;
    if (gated) excludedByEvaluation.add(candidate.businessSlug);
    const hasUnknown = Object.values(evaluation.constraints).some((r) => r.status === "UNKNOWN");
    // Keep the pre-M10.11 comparison visible: an advisory NO_MATCH (for
    // example typical turnaround) may disagree with planning yet must remain
    // retained. `gate` below states the actual action taken.
    const evaluationWouldQuery = evaluation.overall.status !== "EXCLUDED";
    const gate = gated
      ? "EXCLUDED"
      : hasUnknown
        ? "RETAINED_UNKNOWN"
        : exclusion || evaluation.overall.status === "EXCLUDED"
          ? "RETAINED_ADVISORY"
          : "RETAINED_MATCH";
    trace.candidateEvaluated(summarizeForTrace(evaluation), {
      queryable,
      agreesWithPolicy: queryable === evaluationWouldQuery,
      gate,
    });

    if (gated) {
      run.reason({
        code: "AUTHORITATIVE_CANDIDATE_MISMATCH",
        statement: `${candidate.businessName} was not asked for a quote because it explicitly cannot meet a requested product, quantity, or fulfilment constraint.`,
      });
    }
  }

  if (excludedByEvaluation.size > 0) {
    const retained = plan.toQuery.filter(
      (item) => !excludedByEvaluation.has(item.candidate.businessSlug),
    );
    const excluded = plan.toQuery.filter((item) =>
      excludedByEvaluation.has(item.candidate.businessSlug),
    );
    for (const item of excluded) {
      item.disqualifiers.push({
        code: "FULFILMENT_MISMATCH",
        statement: `${item.candidate.businessName} explicitly does not offer the fulfilment method requested.`,
      });
    }
    plan.toQuery = retained;
    plan.skipped.push(...excluded);
    plan.committedFeeUsd = retained.reduce((total, item) => total + item.feeUsd, 0);
  }

  if (plan.toQuery.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUERYABLE_PROVIDER",
      statement:
        "Every printer was ruled out before anything was spent — none is available with current prices right now.",
    });
  }

  // --- ACT: request quotes ------------------------------------------------
  const brief = briefFromIntent(intent);
  const pending: { taskId: string; businessSlug: string; businessName: string }[] = [];
  const answered = new Map<string, ProviderOffer>();
  let committedReplanFeeUsd = 0;

  // Hard bound on any single wait loop. The clock is the real exit condition,
  // but a stalled or injected clock must not be able to spin this forever.
  const maxPolls = Math.max(1, Math.ceil(quoteWaitMs / Math.max(1, pollIntervalMs)) + 1);

  const requestQuotesFor = async (assessments: CandidateAssessment[]): Promise<void> => {
    run.to("REQUESTING_QUOTES");
    for (const item of assessments) {
      if (pending.some((p) => p.businessSlug === item.candidate.businessSlug)) continue;
      const accepted = await callTool(
        AGENT_TOOLS.requestQuote,
        { businessSlug: item.candidate.businessSlug, routeSlug, brief },
        ctx,
        trace,
      );
      if (!accepted.ok || !accepted.data) {
        run.reason({
          code: accepted.errorCode ?? "QUOTE_REQUEST_FAILED",
          statement: `${item.candidate.businessName} could not take the request just now.`,
        });
        continue;
      }
      pending.push({
        taskId: accepted.data.taskId,
        businessSlug: item.candidate.businessSlug,
        businessName: item.candidate.businessName,
      });
      run.reason({
        code: "QUOTE_REQUESTED",
        statement:
          `Asked ${item.candidate.businessName} for a price` +
          (item.feeUsd > 0 ? `, for a $${item.feeUsd.toFixed(3)} fee.` : ", at no cost.") +
          (accepted.data.responseSlaMinutes
            ? ` They usually reply within ${accepted.data.responseSlaMinutes} minutes.`
            : ""),
      });
    }
    requestedQuotes = pending.map((item) => ({
      taskId: item.taskId,
      businessSlug: item.businessSlug,
      businessName: item.businessName,
    }));
    emit();
  };

  const observe = async (): Promise<void> => {
    run.to("AWAITING_QUOTES");
    run.reason({
      code: "AWAITING_HUMANS",
      statement: `Waiting for ${pending.length - answered.size} printer${
        pending.length - answered.size === 1 ? "" : "s"
      } to reply. Real people answer these, so it takes a moment.`,
    });
    const deadline = now().getTime() + quoteWaitMs;
    let polls = 0;
    while (answered.size < pending.length && now().getTime() < deadline && polls < maxPolls) {
      polls += 1;
      for (const item of pending) {
        if (answered.has(item.taskId)) continue;
        const status = await callTool(
          AGENT_TOOLS.getQuoteStatus,
          { taskId: item.taskId },
          ctx,
          trace,
        );
        if (status.ok && status.data?.offer) {
          // The task view has no business slug; stamp the real identity from the
          // candidate the agent actually asked, so the offer fingerprint and the
          // approval card are bound to a known provider.
          answered.set(item.taskId, {
            ...status.data.offer,
            businessSlug: item.businessSlug,
            businessName: item.businessName,
          });
          run.reason({
            code: "QUOTE_RECEIVED",
            statement:
              status.data.offer.status === "DECLINED"
                ? `${item.businessName} turned the job down.`
                : `${item.businessName} sent a price.`,
          });
          offers = [...answered.values()];
          emit();
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
          statement: `${item.businessName} had not replied in time, so they are not in the comparison.`,
        });
      }
    }
    offers = [...answered.values()];
  };

  // Which of the allowed providers to actually quote — the model may pick a
  // subset or reorder, but never add one policy already excluded.
  let toQuery = plan.toQuery;
  if (hooks.planQuotes) {
    try {
      const planned = await hooks.planQuotes(plan.toQuery, plan, intent, hookCtx());
      if (planned && planned.order.length > 0) {
        const allowedSlugs = new Set(plan.toQuery.map((a) => a.candidate.businessSlug));
        const filtered = planned.order.filter((a) => allowedSlugs.has(a.candidate.businessSlug));
        if (filtered.length > 0) {
          toQuery = filtered.slice(0, plan.toQuery.length);
          run.reasonAll(planned.notes);
        } else {
          trace.modelFallback("plan_quotes", "NO_VALID_TARGET", "used the deterministic plan");
        }
      }
    } catch {
      trace.modelFallback("plan_quotes", "HOOK_ERROR", "used the deterministic plan");
    }
  }

  await requestQuotesFor(toQuery);
  if (pending.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUOTE_REQUESTS_ACCEPTED",
      statement: "No printer accepted the request.",
    });
  }

  // --- OBSERVE: wait for humans -----------------------------------------
  await observe();

  // --- REASON: compare -------------------------------------------------
  run.to("COMPARING");
  selection = selectOffer(offers, intent, now());
  for (const scored of selection.ranked) run.reasonAll(scored.disqualifiers);

  // --- ADAPT: nothing usable → maybe re-quote a provider that never answered ---
  if (!selection.selected && hooks.replan) {
    const unanswered = plan.assessed.filter(
      (a) => a.queryable && !pending.some((p) => p.businessSlug === a.candidate.businessSlug),
    );
    const budgetRemainingUsd = plan.budgetUsd - plan.committedFeeUsd - committedReplanFeeUsd;

    let rp: ReplanResult | null = null;
    try {
      rp = await hooks.replan(
        {
          reasonUnusable: selection.selectionReason,
          unanswered,
          budgetRemainingUsd,
          answered: [...answered.values()].map((o) => ({
            businessSlug: o.businessSlug,
            status: o.status,
          })),
        },
        hookCtx(),
      );
    } catch {
      trace.modelFallback("replan", "HOOK_ERROR", "stopped without re-quoting");
    }

    const requote = (rp?.requote ?? []).filter(
      (a) =>
        unanswered.some((u) => u.candidate.businessSlug === a.candidate.businessSlug) &&
        committedReplanFeeUsd + a.feeUsd <= budgetRemainingUsd,
    );

    if (requote.length > 0) {
      committedReplanFeeUsd += requote.reduce((sum, a) => sum + a.feeUsd, 0);
      run.reason({
        code: "MODEL_REPLAN",
        statement:
          rp?.reason ?? `Requesting a fresh quote from ${requote.length} more provider(s).`,
      });
      run.reasonAll(rp?.notes ?? []);
      run.to("PLANNING"); // COMPARING -> PLANNING (the ADAPT edge)
      await requestQuotesFor(requote);
      await observe();
      run.to("COMPARING");
      selection = selectOffer(offers, intent, now());
      for (const scored of selection.ranked) run.reasonAll(scored.disqualifiers);
    } else if (rp) {
      trace.modelDecision("REPLAN_STOP", rp.reason);
    }
  }

  if (offers.length === 0) {
    return bail("NO_VIABLE_OFFER", {
      code: "NO_QUOTES_RETURNED",
      statement: `No printer replied within ${Math.round(quoteWaitMs / 1000)} seconds. Their requests are still open on their side.`,
    });
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

  // --- REASON: the model chooses among the still-valid eligible offers -----
  if (hooks.chooseOffer && selection.eligible.length > 0) {
    try {
      const choice = await hooks.chooseOffer(selection, intent, hookCtx());
      if (choice) {
        const picked = selection.eligible.find(
          (s) => s.offer.businessSlug === choice.selectedBusinessSlug,
        );
        if (picked) {
          // The deterministic uncertainties are the honesty bound and always
          // stand. The model may add to them, but a near-restatement of one we
          // already show is noise, not a second caveat.
          const uncertainties = mergeUncertainties(selection.uncertainties, choice.uncertainties);
          selection = {
            ...selection,
            selected: picked,
            selectionReason: choice.reason,
            uncertainties,
          };
          run.reasonAll(choice.notes);
          run.reason({ code: "MODEL_OFFER_SELECTED", statement: choice.reason });
          for (const tradeoff of choice.tradeoffs) {
            run.reason({ code: "MODEL_TRADEOFF", statement: tradeoff });
          }
        } else {
          trace.modelFallback(
            "select_offer",
            "UNKNOWN_PROVIDER",
            `model named "${choice.selectedBusinessSlug}", not an eligible offer — kept the deterministic pick`,
          );
        }
      }
    } catch {
      trace.modelFallback("select_offer", "HOOK_ERROR", "kept the deterministic pick");
    }
  }

  run.reason({ code: "OFFER_SELECTED", statement: selection.selectionReason });

  // --- Stop at the human ---------------------------------------------------
  run.to("AWAITING_APPROVAL");
  const gate = evaluateApproval(selection, null);
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

  // The approved quote is now a commitment. Creation happened server-side and
  // transactionally with the decision; this only asks for the attestation to be
  // written, which is idempotent and safe to retry. Orchestration, not a tool:
  // the agent does not get to choose whether a commitment is attested.
  trace.commitment(
    "COMMITMENT_REQUESTED",
    `Attesting the commitment for ${gate.card.businessName}.`,
    {
      taskId: gate.card.taskId,
    },
  );

  const attested = await ctx.http.request<{
    status: string;
    jobRef: string;
    handoverCommit: string;
    validUntil: string;
    attestationUid: string | null;
    attestationTxHash: string | null;
    mode: string | null;
    simulated: boolean;
  }>("POST", `/api/tasks/${encodeURIComponent(gate.card.taskId)}/commitment`, {
    idempotent: true,
    session: true,
  });

  let commitment: AgentCommitmentView | null = null;
  if (attested.ok && attested.data) {
    commitment = {
      status: attested.data.status,
      jobRef: attested.data.jobRef,
      handoverCommit: attested.data.handoverCommit,
      validUntil: attested.data.validUntil,
      attestationUid: attested.data.attestationUid,
      attestationTxHash: attested.data.attestationTxHash,
      mode: attested.data.mode,
      simulated: attested.data.simulated === true,
    };
    trace.commitment(
      commitment.status === "ATTESTED" ? "COMMITMENT_ATTESTED" : "COMMITMENT_ATTESTATION_FAILED",
      commitment.status === "ATTESTED"
        ? `Commitment attested (${commitment.mode}${commitment.simulated ? ", simulated" : ""}).`
        : "The commitment could not be attested; the approval stands and the write can be retried.",
      {
        jobRef: commitment.jobRef,
        attestationUid: commitment.attestationUid,
        txHash: commitment.attestationTxHash,
        mode: commitment.mode,
        status: commitment.status,
      },
    );
  } else {
    // The buyer's approval is recorded and must not be undone by a failure to
    // attest. The commitment row exists and the write is retryable.
    trace.commitment(
      "COMMITMENT_ATTESTATION_FAILED",
      `Could not attest the commitment (${attested.errorCode}). The approval stands and the write can be retried.`,
      { code: attested.errorCode },
    );
  }

  return {
    ...result,
    state: "APPROVED",
    summary: `Approved: ${gate.card.businessName} at ${gate.card.price}. ${gate.card.finalOrderStatement}`,
    reasons: [...result.reasons, approvalReason(gate)],
    commitment,
    trace: trace.toJSON(),
  };
}

/** Significant words, for comparing two caveats that say the same thing. */
function significantWords(line: string): Set<string> {
  return new Set(
    line
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

/**
 * Keep every deterministic caveat, then add only the model's caveats that say
 * something new. Two lines that share most of their significant words are the
 * same caveat worded differently.
 */
export function mergeUncertainties(base: string[], extra: string[]): string[] {
  const out = base.filter((line) => line.trim().length > 0);
  for (const line of extra) {
    if (line.trim().length === 0) continue;
    const words = significantWords(line);
    if (words.size === 0) continue;
    const duplicate = out.some((existing) => {
      const other = significantWords(existing);
      const shared = [...words].filter((word) => other.has(word)).length;
      return shared / Math.min(words.size, other.size) >= 0.6;
    });
    if (!duplicate) out.push(line);
  }
  return out;
}

export { isTerminal };
