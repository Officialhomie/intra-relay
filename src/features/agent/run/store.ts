import type { AgentRunProgress, AgentRunResult } from "../runtime/loop";

/**
 * In-memory store for buyer-agent runs.
 *
 * DELIBERATELY NON-PERSISTENT (CLAUDE.md §4.4). The commercial facts a run
 * produces — the task, the quote, the buyer's decision, the commitment — are all
 * written to the database by the existing task/commitment services. What lives
 * here is only orchestration metadata: the trace, the ranked offers, and which
 * offer the human was shown. A server restart drops it; the UI says so and the
 * run can be started again.
 *
 * Keyed by an opaque runId. Each entry is bound to the browser session that
 * created it (`buyerSessionId`) so another device cannot read or approve it.
 */

export type AgentRunStatus =
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "DECLINED"
  | "NO_VIABLE_OFFER"
  | "CLARIFICATION_NEEDED"
  | "FAILED";

export interface StoredAgentRun {
  runId: string;
  /** Browser session (x-session-id) that started the run — the only one allowed to read/approve it. */
  buyerSessionId: string;
  /** Server-generated Intra session the agent's own tasks belong to (`agent:<rand>`). */
  agentSessionId: string;
  agentId: string;
  /** Absolute origin the agent calls back into (the app itself). */
  origin: string;
  request: string;
  mode: "assisted" | "deterministic";
  status: AgentRunStatus;
  createdAt: number;
  updatedAt: number;
  /** Populated once the run leaves RUNNING. */
  result: AgentRunResult | null;
  /** Live milestone snapshot while RUNNING (candidate/quote counts, trace so far). */
  progress: AgentRunProgress | null;
  /** Which model backed this run, and how many calls it actually made. */
  model: { provider: string; model: string; configured: boolean; calls: number };
  /** A model-authored clarification question, when status is CLARIFICATION_NEEDED. */
  clarification: { question: string; missing: string[] } | null;
  /** Set once the human has approved or declined. */
  decidedAt: number | null;
  error: string | null;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_RUNS = 200;

/**
 * Held on `globalThis` on purpose. Next.js gives each route file its own module
 * graph, so a plain module-level `Map` would be a *different* map in
 * `POST /api/agent/run` and `GET /api/agent/run/:id`. `globalThis` is shared
 * across every route in one process. (Still per-process — a second serverless
 * instance has its own; acceptable for a non-persistent demo store.)
 */
const globalForRuns = globalThis as unknown as {
  __intraAgentRuns?: Map<string, StoredAgentRun>;
};

const runs: Map<string, StoredAgentRun> =
  globalForRuns.__intraAgentRuns ?? (globalForRuns.__intraAgentRuns = new Map());

function sweep(now: number): void {
  for (const [id, run] of runs) {
    if (now - run.updatedAt > TTL_MS) runs.delete(id);
  }
  // Hard cap: drop the oldest if we somehow exceed it.
  while (runs.size > MAX_RUNS) {
    const oldest = [...runs.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!oldest) break;
    runs.delete(oldest.runId);
  }
}

export function putRun(run: StoredAgentRun): void {
  sweep(Date.now());
  runs.set(run.runId, run);
}

export function getRun(runId: string): StoredAgentRun | null {
  sweep(Date.now());
  return runs.get(runId) ?? null;
}

export function patchRun(runId: string, patch: Partial<StoredAgentRun>): StoredAgentRun | null {
  const current = runs.get(runId);
  if (!current) return null;
  const next: StoredAgentRun = { ...current, ...patch, updatedAt: Date.now() };
  runs.set(runId, next);
  return next;
}

/** Test hook. */
export function __clearRuns(): void {
  runs.clear();
}
