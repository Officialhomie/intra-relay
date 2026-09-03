import { randomUUID } from "node:crypto";

import { AgentHttpClient } from "../tools/client";
import type { ToolContext } from "../tools/registry";
import {
  runBuyerAgent,
  submitApproval,
  type AgentRunOptions,
  type AgentRunResult,
} from "../runtime/loop";
import { getRun, patchRun, putRun, type AgentRunStatus, type StoredAgentRun } from "./store";

/**
 * The orchestration the `/api/agent/*` routes call. One job: turn an HTTP
 * request into a running buyer-agent, hold its result in the (non-persistent)
 * store, and apply a human approval to it later.
 *
 * The agent reaches Intra only through its public HTTP surface — the same
 * `AgentHttpClient` the tests use, pointed at this app's own origin. It never
 * imports a repository.
 */

export interface StartAgentRunInput {
  request: string;
  buyerSessionId: string;
  /** Absolute origin of this deployment, e.g. https://intra.example or http://localhost:3000. */
  origin: string;
  mode?: "assisted" | "deterministic";
  options?: Pick<
    AgentRunOptions,
    "maxProviders" | "maxQueryFeeUsd" | "quoteWaitMs" | "pollIntervalMs" | "routeSlug"
  >;
  /**
   * A buyer's correction to a previous run's reading of the same request. The
   * request text is carried forward unchanged — the buyer never retypes it.
   */
  briefCorrection?: AgentRunOptions["briefCorrection"];
  /** Test-only: a fetch implementation for the agent's HTTP client. */
  fetchImpl?: typeof fetch;
}

const fetchImpls = new Map<string, typeof fetch>();

/** Test hook: drop injected fetch implementations. */
export function __clearAgentRunFetch(): void {
  fetchImpls.clear();
}

const DEFAULT_RUN_OPTIONS: AgentRunOptions = {
  quoteWaitMs: 90_000,
  pollIntervalMs: 4_000,
};

/** Clean an agent id into the session the `/v1` quote API will assign its tasks. */
function agentSessionIdFor(agentId: string): string {
  return `agent:${agentId.replace(/[^\w.:-]/g, "").slice(0, 100)}`;
}

function statusFromResult(result: AgentRunResult): AgentRunStatus {
  switch (result.state) {
    case "AWAITING_APPROVAL":
      return "AWAITING_APPROVAL";
    case "APPROVED":
      return "APPROVED";
    case "DECLINED":
      return "DECLINED";
    case "NO_VIABLE_OFFER":
      return "NO_VIABLE_OFFER";
    case "CLARIFICATION_NEEDED":
      return "CLARIFICATION_NEEDED";
    default:
      return "FAILED";
  }
}

function toolContext(run: StoredAgentRun): ToolContext {
  return {
    http: new AgentHttpClient({
      baseUrl: run.origin,
      agentId: run.agentId,
      sessionId: run.agentSessionId,
      fetchImpl: fetchImpls.get(run.runId),
    }),
    agentId: run.agentId,
    buyerSessionId: run.buyerSessionId,
  };
}

/**
 * Resolve which runner to use. Split out so milestone 3's model-assisted loop
 * can be slotted in without touching the store or the routes.
 */
async function runAgent(
  run: StoredAgentRun,
  ctx: ToolContext,
  options: AgentRunOptions,
): Promise<{
  result: AgentRunResult;
  clarification: StoredAgentRun["clarification"];
  model: StoredAgentRun["model"];
}> {
  if (run.mode === "assisted") {
    const { runBuyerAgentAssisted } = await import("../runtime/assisted");
    const outcome = await runBuyerAgentAssisted(run.request, ctx, options);
    return {
      result: outcome.result,
      clarification: outcome.clarification,
      model: outcome.model,
    };
  }
  const result = await runBuyerAgent(run.request, ctx, options);
  return {
    result,
    clarification: result.clarification,
    model: { provider: "none", model: "-", configured: false, calls: 0 },
  };
}

async function executeRun(runId: string, options: AgentRunOptions): Promise<void> {
  const run = getRun(runId);
  if (!run) return;
  const withProgress: AgentRunOptions = {
    ...options,
    onProgress: (snapshot) => {
      patchRun(runId, { progress: snapshot });
    },
  };
  try {
    const { result, clarification, model } = await runAgent(run, toolContext(run), withProgress);
    patchRun(runId, {
      result,
      clarification,
      model,
      status: statusFromResult(result),
    });
  } catch (error) {
    patchRun(runId, {
      status: "FAILED",
      error: error instanceof Error ? error.message : "The agent run failed unexpectedly.",
    });
  }
}

export function startAgentRun(input: StartAgentRunInput): StoredAgentRun {
  const runId = randomUUID();
  const agentId = `intra-demo-buyer-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const now = Date.now();

  const run: StoredAgentRun = {
    runId,
    buyerSessionId: input.buyerSessionId,
    agentSessionId: agentSessionIdFor(agentId),
    agentId,
    origin: input.origin,
    request: input.request,
    mode: input.mode ?? "assisted",
    status: "RUNNING",
    createdAt: now,
    updatedAt: now,
    result: null,
    progress: null,
    model: { provider: "pending", model: "-", configured: false, calls: 0 },
    clarification: null,
    decidedAt: null,
    error: null,
  };
  putRun(run);
  if (input.fetchImpl) fetchImpls.set(runId, input.fetchImpl);

  const options: AgentRunOptions = {
    ...DEFAULT_RUN_OPTIONS,
    ...input.options,
    briefCorrection: input.briefCorrection,
  };
  // Fire-and-forget: the HTTP response returns immediately and the client polls
  // GET /api/agent/run/:id. On a long-lived Node server (next dev / a container)
  // this completes normally; a serverless cold-stop would leave it RUNNING,
  // which the store's TTL eventually reaps.
  void executeRun(runId, options);

  return run;
}

export function getAgentRunForSession(
  runId: string,
  buyerSessionId: string,
): { run: StoredAgentRun | null; forbidden: boolean } {
  const run = getRun(runId);
  if (!run) return { run: null, forbidden: false };
  if (run.buyerSessionId !== buyerSessionId) return { run: null, forbidden: true };
  return { run, forbidden: false };
}

export interface ApproveAgentRunInput {
  runId: string;
  buyerSessionId: string;
  decision: "ACCEPT" | "DECLINE";
  reason?: string;
  /** The exact offer fingerprint shown on the approval card. */
  offerFingerprint: string;
}

export type ApproveAgentRunOutcome =
  { ok: true; run: StoredAgentRun } | { ok: false; code: string; message: string; status: number };

export async function approveAgentRun(
  input: ApproveAgentRunInput,
): Promise<ApproveAgentRunOutcome> {
  const { run, forbidden } = getAgentRunForSession(input.runId, input.buyerSessionId);
  if (forbidden) {
    return {
      ok: false,
      code: "NOT_YOUR_RUN",
      message: "This run belongs to another device.",
      status: 403,
    };
  }
  if (!run) {
    return {
      ok: false,
      code: "RUN_NOT_FOUND",
      message: "No such run. It may have expired.",
      status: 404,
    };
  }
  if (run.status === "RUNNING") {
    return {
      ok: false,
      code: "RUN_IN_PROGRESS",
      message: "The agent is still working. Try again shortly.",
      status: 409,
    };
  }
  if (run.status !== "AWAITING_APPROVAL" || !run.result) {
    return {
      ok: false,
      code: "NOT_AWAITING_APPROVAL",
      message: `This run is ${run.status.toLowerCase().replace(/_/g, " ")}, not waiting for a decision.`,
      status: 409,
    };
  }

  const final = await submitApproval(
    run.result,
    {
      granted: input.decision === "ACCEPT",
      offerFingerprint: input.offerFingerprint,
      reason: input.reason,
    },
    toolContext(run),
  );

  const decided =
    final.state === "APPROVED" || final.state === "DECLINED" ? Date.now() : run.decidedAt;

  const patched = patchRun(input.runId, {
    result: final,
    status: statusFromResult(final),
    decidedAt: decided,
  });

  return { ok: true, run: patched ?? { ...run, result: final, status: statusFromResult(final) } };
}
