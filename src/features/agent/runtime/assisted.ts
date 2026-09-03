import type { z } from "zod";

import type { AgentTrace } from "../trace";
import type { CandidateAssessment } from "../policy/candidates";
import { mergeIntent } from "../model/normalize";
import {
  intentInterpretationSchema,
  offerReasoningSchema,
  quotePlanSchema,
  replanDecisionSchema,
} from "../model/schema";
import {
  clampUser,
  intentSystemPrompt,
  intentUserPrompt,
  planSystemPrompt,
  planUserPrompt,
  replanSystemPrompt,
  replanUserPrompt,
  selectSystemPrompt,
  selectUserPrompt,
} from "../model/prompt";
import { resolveModelProvider, type ResolvedModel } from "../model/provider";
import {
  DEFAULT_MODEL_LIMITS,
  ModelUnavailableError,
  type ModelCallLimits,
  type ModelProvider,
  type ModelPurpose,
} from "../model/types";
import {
  runBuyerAgent,
  type AgentHookContext,
  type AgentRunHooks,
  type AgentRunOptions,
  type AgentRunResult,
} from "./loop";

/**
 * Model-assisted buyer agent (milestone 3).
 *
 *   USER → LLM (understand · plan · reason · replan) → DETERMINISTIC POLICY
 *          (budget · expiry · eligibility · approval · safety) → EXTERNAL TOOLS
 *
 * The model never gets a tool handle and never reaches `recordBuyerDecision`.
 * Every model call is bounded (`limits`), validated against a schema, and — on
 * any failure — silently replaced by the deterministic decision. With no
 * provider configured the whole thing is exactly `runBuyerAgent`.
 */

export interface AssistedRunOptions extends AgentRunOptions {
  /** Injected in tests; falls back to `resolveModelProvider()`. */
  modelProvider?: ModelProvider | null;
  limits?: Partial<ModelCallLimits>;
}

export interface AssistedRunOutcome {
  result: AgentRunResult;
  clarification: { question: string; missing: string[] } | null;
  model: {
    provider: string;
    model: string;
    configured: boolean;
    /** Model calls actually made in this run. */
    calls: number;
  };
}

export async function runBuyerAgentAssisted(
  request: string,
  ctx: Parameters<typeof runBuyerAgent>[1],
  options: AssistedRunOptions = {},
): Promise<AssistedRunOutcome> {
  const resolved: ResolvedModel =
    options.modelProvider !== undefined
      ? {
          provider: options.modelProvider,
          info: {
            provider: options.modelProvider?.info.provider ?? "none",
            model: options.modelProvider?.info.model ?? "-",
            configured: options.modelProvider != null,
            worksWithoutCredits: options.modelProvider?.info.worksWithoutCredits ?? true,
            reason: "injected",
          },
        }
      : resolveModelProvider();

  const provider = resolved.provider;
  const limits: ModelCallLimits = { ...DEFAULT_MODEL_LIMITS, ...options.limits };

  if (!provider) {
    const result = await runBuyerAgent(request, ctx, options);
    return {
      result,
      clarification: result.clarification,
      model: {
        provider: resolved.info.provider,
        model: resolved.info.model,
        configured: false,
        calls: 0,
      },
    };
  }

  let callsUsed = 0;

  /** One bounded, validated model call. Returns null on ANY failure. */
  async function callModel<T>(
    purpose: ModelPurpose,
    system: string,
    user: string,
    schema: z.ZodType<T>,
    schemaName: string,
    trace: AgentTrace,
    detail: string,
  ): Promise<T | null> {
    if (callsUsed >= limits.maxCallsPerRun) {
      trace.modelFallback(
        purpose,
        "CALL_BUDGET_EXCEEDED",
        `used ${callsUsed}/${limits.maxCallsPerRun}`,
      );
      return null;
    }
    callsUsed += 1;
    trace.modelRequest(purpose, detail);
    const started = Date.now();
    try {
      const res = await provider!.generate(
        {
          purpose,
          system,
          user: clampUser(user, limits.maxInputChars),
          schema,
          schemaName,
        },
        limits,
      );
      trace.modelResponse(purpose, res.value as Record<string, unknown>, Date.now() - started);
      return res.value;
    } catch (error) {
      const code = error instanceof ModelUnavailableError ? error.code : "PROVIDER_ERROR";
      const message = error instanceof Error ? error.message : "unknown model error";
      trace.modelFallback(purpose, code, message);
      return null;
    }
  }

  const hooks: AgentRunHooks = {
    async refineIntent(deterministic, hc: AgentHookContext) {
      const value = await callModel(
        "understand_intent",
        intentSystemPrompt(),
        intentUserPrompt(hc.request),
        intentInterpretationSchema,
        "IntentInterpretation",
        hc.trace,
        "turning the request into a structured brief",
      );
      if (!value) return null;

      const merged = mergeIntent(deterministic, value, hc.now);
      if (merged.clarification) {
        hc.trace.modelDecision("CLARIFY", merged.clarification.question);
      }
      return {
        intent: merged.intent,
        clarification: merged.clarification,
        outOfScope: merged.outOfScope,
        notes: merged.notes,
      };
    },

    async planQuotes(allowed, plan, intent, hc) {
      if (allowed.length <= 1) return null;
      const value = await callModel(
        "plan_quotes",
        planSystemPrompt(),
        planUserPrompt(intent, plan),
        quotePlanSchema,
        "QuotePlan",
        hc.trace,
        `choosing which of ${allowed.length} allowed providers to quote`,
      );
      if (!value) return null;

      const bySlug = new Map(allowed.map((a) => [a.candidate.businessSlug, a]));
      const order: CandidateAssessment[] = [];
      const seen = new Set<string>();
      for (const entry of value.quote) {
        const match = bySlug.get(entry.businessSlug);
        if (match && !seen.has(entry.businessSlug)) {
          order.push(match);
          seen.add(entry.businessSlug);
        }
      }
      if (order.length === 0) {
        hc.trace.modelFallback(
          "plan_quotes",
          "NO_ALLOWED_TARGET",
          "model named no provider that policy allows — using the deterministic plan",
        );
        return null;
      }
      hc.trace.modelToolSelection("requestQuote", {
        businessSlugs: order.map((a) => a.candidate.businessSlug),
      });
      return {
        order,
        notes: [
          {
            code: "MODEL_QUOTE_PLAN",
            statement:
              value.note ||
              `Model chose to request quotes from ${order.length} of ${allowed.length} eligible providers.`,
          },
        ],
      };
    },

    async chooseOffer(selection, _intent, hc) {
      if (selection.eligible.length === 0) return null;
      const value = await callModel(
        "select_offer",
        selectSystemPrompt(),
        selectUserPrompt(_intent, selection),
        offerReasoningSchema,
        "OfferReasoning",
        hc.trace,
        `recommending one of ${selection.eligible.length} eligible quotes`,
      );
      if (!value) return null;
      return {
        selectedBusinessSlug: value.selectedBusinessSlug,
        reason: value.reason,
        tradeoffs: value.tradeoffs,
        uncertainties: value.uncertainties,
        notes: [],
      };
    },

    async replan(input, hc) {
      if (input.unanswered.length === 0 || input.budgetRemainingUsd <= 0) return null;
      const value = await callModel(
        "replan",
        replanSystemPrompt(),
        replanUserPrompt({
          reasonOffersUnusable: input.reasonUnusable,
          availableToRequote: input.unanswered.map((a) => ({
            businessSlug: a.candidate.businessSlug,
            businessName: a.candidate.businessName,
            feeUsd: a.feeUsd,
          })),
          budgetRemainingUsd: input.budgetRemainingUsd,
          answeredOffers: input.answered,
        }),
        replanDecisionSchema,
        "ReplanDecision",
        hc.trace,
        "deciding whether to re-quote or stop",
      );
      if (!value) return null;

      if (value.action === "stop") {
        return { requote: [], reason: value.reason, notes: [] };
      }
      const bySlug = new Map(input.unanswered.map((a) => [a.candidate.businessSlug, a]));
      const requote = value.requoteBusinessSlugs
        .map((s) => bySlug.get(s))
        .filter((a): a is CandidateAssessment => Boolean(a));
      return { requote, reason: value.reason, notes: [] };
    },
  };

  const result = await runBuyerAgent(request, ctx, { ...options, hooks });

  return {
    // The loop decides deterministically whether a clarification is needed; the
    // model only phrases it.
    result,
    clarification: result.clarification,
    model: {
      provider: resolved.info.provider,
      model: resolved.info.model,
      configured: true,
      calls: callsUsed,
    },
  };
}
