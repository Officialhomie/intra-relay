import type { ScoredOffer } from "../types";
import type { AgentRunResult } from "../runtime/loop";
import { buildActivity, type ActivityItem } from "./activity";
import { outcomeCopy, type OutcomeCopy } from "./copy";
import { buildStages, currentStageLine, type RunStage } from "./stages";
import type { StoredAgentRun } from "./store";

/**
 * The public shape of a run, returned by `GET /api/agent/run/:id`.
 *
 * This is the *product* view, not a database dump: semantic stages, a narrative
 * of who did what, a recommendation a person can read, and the alternatives it
 * was chosen over. The engineering material (raw trace, tool names, model call
 * counts) is still here, but separated so the UI can put it behind progressive
 * disclosure rather than mixing it into the primary experience.
 *
 * Never includes `agentSessionId`, `buyerSessionId`, or the handover
 * secret/salt (the run result never carries them). The trace is already
 * redacted by `AgentTrace`.
 */

export interface UnderstandingView {
  quantity: number | null;
  size: string | null;
  colour: string | null;
  /** ISO instant. */
  deadline: string | null;
  deliveryArea: string | null;
  /** One-line plain-language restatement, e.g. "500 A5 flyers, full colour". */
  summary: string;
}

export interface OfferView {
  businessSlug: string;
  businessName: string;
  price: string;
  priceBasis: "fixed price" | "estimate";
  turnaround: string;
  expiresAt: string | null;
  /** How this option compares with the recommended one, in plain words. */
  comparedToPick: string | null;
}

export interface RecommendationView {
  businessSlug: string;
  businessName: string;
  price: string;
  priceBasis: "fixed price" | "estimate";
  turnaround: string;
  issuedAt: string | null;
  expiresAt: string | null;
  selectionReason: string;
  uncertainties: string[];
  tradeoffs: string[];
  offerFingerprint: string;
  finalOrderStatement: string;
  /** True when a model authored the rationale rather than the scoring rules. */
  modelReasoned: boolean;
  /** The task this quote belongs to — the buyer's workspace after approval. */
  taskId: string;
  /** Progressive disclosure: real facts, moved out of the primary view. */
  details: { label: string; value: string }[];
}

export interface AgentRunView {
  runId: string;
  status: StoredAgentRun["status"];
  mode: StoredAgentRun["mode"];
  /** Which model backed the run. `configured: false` means it ran deterministically. */
  model: StoredAgentRun["model"];
  request: string;
  /** This orchestration metadata is not saved anywhere (CLAUDE.md §4.4). */
  notPersisted: true;
  createdAt: string;
  updatedAt: string;

  /** The buyer-facing progress spine. */
  stages: RunStage[];
  /** The single line worth announcing to a screen reader right now. */
  headline: string;
  /** Who did what, in order. Never contains tool names or HTTP detail. */
  activity: ActivityItem[];

  understanding: UnderstandingView | null;
  clarification: { question: string; missing: string[] } | null;
  recommendation: RecommendationView | null;
  /** Other usable quotes, best first. */
  alternatives: OfferView[];
  /** Options the agent set aside, and why — the visible half of its reasoning. */
  ruledOut: { name: string; because: string }[];

  decision: { outcome: "APPROVED" | "DECLINED"; at: string } | null;
  commitment: AgentRunResult["commitment"];
  /** What to tell the buyer when the run ended without a recommendation. */
  outcome: OutcomeCopy | null;
  /** The task workspace to continue in, once there is one. */
  taskId: string | null;

  /** Counts, for the compact progress strip. */
  progress: { providersFound: number; quotesRequested: number; quotesReceived: number };
  /** One row per quote the agent posted — its taskId and which provider. */
  requestedQuotes: { taskId: string; businessSlug: string; businessName: string }[];

  /** Engineering only — kept out of the primary experience by the UI. */
  reasons: { code: string; statement: string }[];
  summary: string;
  trace: AgentRunResult["trace"] | null;
  error: string | null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function offerPrice(scored: ScoredOffer): string {
  const { currency } = scored.offer;
  return scored.totalMax != null && scored.totalMax !== scored.totalMin
    ? `${money(currency, scored.totalMin)}–${money(currency, scored.totalMax)}`
    : money(currency, scored.totalMin);
}

/** A one-line restatement of the brief, in the buyer's terms. */
function understandingSummary(intent: {
  quantity: number | null;
  size: string | null;
  colour: string | null;
  deliveryArea: string | null;
}): string {
  const parts: string[] = [];
  if (intent.quantity !== null) parts.push(`${intent.quantity.toLocaleString("en-US")}`);
  if (intent.size) parts.push(intent.size);
  parts.push(intent.quantity === 1 ? "flyer" : "flyers");
  const head = parts.join(" ");
  const tail: string[] = [];
  if (intent.colour) tail.push(intent.colour);
  if (intent.deliveryArea) tail.push(`to ${intent.deliveryArea}`);
  return tail.length > 0 ? `${head}, ${tail.join(", ")}` : head;
}

/** How an alternative compares with the pick — price and speed, in words. */
function comparison(alt: ScoredOffer, pick: ScoredOffer): string | null {
  const priceDiff = alt.totalMin - pick.totalMin;
  const bits: string[] = [];
  if (priceDiff !== 0) {
    const label = money(alt.offer.currency, Math.abs(priceDiff));
    bits.push(priceDiff < 0 ? `${label} cheaper` : `${label} more`);
  }
  if (alt.turnaroundHours != null && pick.turnaroundHours != null) {
    const hours = alt.turnaroundHours - pick.turnaroundHours;
    if (Math.abs(hours) >= 1) {
      const magnitude =
        Math.abs(hours) >= 24
          ? `${Math.round(Math.abs(hours) / 24)} day${Math.abs(hours) >= 48 ? "s" : ""}`
          : `${Math.round(Math.abs(hours))} hours`;
      bits.push(hours > 0 ? `${magnitude} slower` : `${magnitude} faster`);
    }
  }
  if (bits.length === 0) return null;
  return bits.join(", but ");
}

/** "flyer-printing" -> "Flyer printing". */
function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function detailRows(result: AgentRunResult, pick: ScoredOffer): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (pick.offer.issuedAt) rows.push({ label: "Quote issued", value: pick.offer.issuedAt });
  if (pick.offer.expiresAt) rows.push({ label: "Quote expires", value: pick.offer.expiresAt });
  rows.push({
    label: "Price basis",
    value: pick.offer.fixed
      ? "Fixed price — the printer committed to it"
      : "Estimate — the final price can still move",
  });
  if (pick.offer.confidence) {
    rows.push({ label: "Printer's own confidence", value: pick.offer.confidence });
  }
  if (pick.offer.deliveryCharge != null && pick.offer.deliveryCharge > 0) {
    rows.push({
      label: "Delivery included in total",
      value: money(pick.offer.currency, pick.offer.deliveryCharge),
    });
  }
  const assessment = result.plan?.assessed.find(
    (a) => a.candidate.businessSlug === pick.offer.businessSlug,
  );
  rows.push({
    label: "Agent query fee",
    value:
      assessment && assessment.feeUsd > 0
        ? `$${assessment.feeUsd.toFixed(3)} — paid to ask for the price, never part of your order`
        : "None — this printer answers for free",
  });
  if (assessment?.candidate.freshness?.priceConfirmedAt) {
    rows.push({
      label: "Printer last confirmed prices",
      value: assessment.candidate.freshness.priceConfirmedAt,
    });
  }
  // Even inside a disclosure, a route slug is our identifier, not a service name.
  rows.push({ label: "Service", value: humanizeSlug(pick.offer.routeSlug) });
  return rows;
}

export function toAgentRunView(run: StoredAgentRun): AgentRunView {
  const result = run.result;
  const progress = run.progress;
  const card = result?.approvalCard ?? null;
  const selection = result?.selection ?? null;
  const pick = selection?.selected ?? null;

  const modelReason = result?.reasons.find((r) => r.code === "MODEL_OFFER_SELECTED");
  const tradeoffs = (result?.reasons ?? [])
    .filter((r) => r.code === "MODEL_TRADEOFF")
    .map((r) => r.statement);

  const intent = result?.intent ?? progress?.intent ?? null;
  const providersFound = result?.candidates.length ?? progress?.candidatesFound ?? 0;
  const quotesRequested = result?.requestedQuotes.length ?? progress?.requestedQuotes.length ?? 0;
  const quotesReceived = result?.offers.length ?? progress?.offersReceived ?? 0;

  const unusable = (selection?.ranked ?? []).filter((s) => !s.eligible);
  const skippedBeforeQuoting = (result?.plan?.skipped ?? []).filter(
    (a) => !a.disqualifiers.some((d) => d.code === "ENOUGH_QUOTES"),
  );

  const decision =
    run.decidedAt && (run.status === "APPROVED" || run.status === "DECLINED")
      ? { outcome: run.status, at: iso(run.decidedAt) }
      : null;

  const failedCode = (result?.reasons ?? []).at(-1)?.code ?? null;

  const stages = buildStages({
    agentState: result?.state ?? progress?.state ?? null,
    failureCode: failedCode,
    status: run.status,
    providersFound,
    quotesRequested,
    quotesReceived,
    unusableQuotes: unusable.length,
    ruledOutBeforeQuoting: skippedBeforeQuoting.length,
    hasRecommendation: card != null,
    recommendedName: card?.businessName ?? null,
    clarificationNeeded: run.status === "CLARIFICATION_NEEDED",
    decision: decision?.outcome ?? null,
    commitmentRecorded: result?.commitment != null,
    replanned: (result?.reasons ?? []).some((r) => r.code === "MODEL_REPLAN"),
  });

  const alternatives: OfferView[] =
    pick && selection
      ? selection.eligible
          .filter((s) => s.offer.businessSlug !== pick.offer.businessSlug)
          .map((s) => ({
            businessSlug: s.offer.businessSlug,
            businessName: s.offer.businessName,
            price: offerPrice(s),
            priceBasis: s.offer.fixed ? ("fixed price" as const) : ("estimate" as const),
            turnaround: s.offer.turnaround,
            expiresAt: s.offer.expiresAt,
            comparedToPick: comparison(s, pick),
          }))
      : [];

  const ruledOut = [
    ...unusable.map((s) => ({
      name: s.offer.businessName,
      because: s.disqualifiers[0]?.statement ?? "The quote could not be used.",
    })),
    ...skippedBeforeQuoting.map((a) => ({
      name: a.candidate.businessName,
      because: a.disqualifiers[0]?.statement ?? "Not available right now.",
    })),
  ];

  // Only report an outcome when the run ended WITHOUT something to decide on.
  const outcome =
    run.status === "NO_VIABLE_OFFER" || run.status === "FAILED"
      ? outcomeCopy(failedCode, result?.summary ?? run.error)
      : null;

  return {
    runId: run.runId,
    status: run.status,
    mode: run.mode,
    model: run.model,
    request: run.request,
    notPersisted: true,
    createdAt: iso(run.createdAt),
    updatedAt: iso(run.updatedAt),

    stages,
    headline: currentStageLine(stages),
    activity: buildActivity({
      request: run.request,
      entries: result?.trace.entries ?? progress?.trace.entries ?? [],
      decision,
      recommendedName: card?.businessName ?? null,
    }),

    understanding: intent
      ? {
          quantity: intent.quantity,
          size: intent.size,
          colour: intent.colour,
          deadline: intent.deadline,
          deliveryArea: intent.deliveryArea,
          summary: understandingSummary(intent),
        }
      : null,
    clarification: run.clarification,

    recommendation:
      card && pick && result
        ? {
            businessSlug: card.businessSlug,
            businessName: card.businessName,
            price: card.price,
            priceBasis: card.priceBasis,
            turnaround: card.turnaround,
            issuedAt: pick.offer.issuedAt,
            expiresAt: card.expiresAt,
            selectionReason: modelReason?.statement ?? card.selectionReason,
            uncertainties: card.uncertainties,
            tradeoffs,
            offerFingerprint: card.offerFingerprint,
            finalOrderStatement: card.finalOrderStatement,
            modelReasoned: Boolean(modelReason),
            taskId: card.taskId,
            details: detailRows(result, pick),
          }
        : null,
    alternatives,
    ruledOut,

    decision,
    commitment: result?.commitment ?? null,
    outcome,
    taskId: card?.taskId ?? null,

    progress: { providersFound, quotesRequested, quotesReceived },
    requestedQuotes: result?.requestedQuotes ?? progress?.requestedQuotes ?? [],

    reasons: result?.reasons ?? progress?.reasons ?? [],
    summary: result?.summary ?? run.error ?? "The agent is working…",
    trace: result?.trace ?? progress?.trace ?? null,
    error: run.error,
  };
}
