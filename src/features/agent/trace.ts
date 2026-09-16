import { randomUUID } from "node:crypto";

import type { DecisionReason } from "./types";
import type { AgentRunState } from "./state";
import type { CandidateEvaluationSummary } from "./policy/evaluation";

/**
 * Structured, replayable trace of one agent run.
 *
 * This is the demo artefact and the debugging surface: thought -> tool call ->
 * result -> decision -> outcome. Two rules make it safe to show anyone:
 *
 *   1. It records *structured decision reasons*, never model chain-of-thought.
 *   2. Every value passes through `redact()` before it is stored, so headers,
 *      keys and tokens cannot leak into a trace that ends up on a screen
 *      (NFR-SEC-002).
 */

export type TraceEntryKind =
  | "run_started"
  | "state_changed"
  | "tool_called"
  | "tool_result"
  | "tool_failed"
  | "decision"
  | "approval_requested"
  | "approval_recorded"
  | "commitment"
  | "model_request"
  | "model_response"
  | "model_tool_selection"
  | "model_decision"
  | "model_fallback"
  | "candidate_evaluation"
  | "run_finished";

export interface TraceEntry {
  at: string;
  kind: TraceEntryKind;
  /** Tool name, state name, or decision code. */
  label: string;
  detail?: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

/** Keys whose values are never recorded, at any depth. */
const REDACTED_KEYS = [
  "authorization",
  "x-payment",
  "x-operator-key",
  "manageToken",
  "manage_token",
  "apiKey",
  "api_key",
  "privateKey",
  "private_key",
  "signerKey",
  "secret",
  "sessionId",
  "session_id",
  "pickupCode",
  "handoverCode",
  "handoverSalt",
  "salt",
  "phone",
  "whatsapp",
  "contactValue",
];

const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.some((needle) => key.toLowerCase() === needle.toLowerCase())
      ? REDACTED
      : redact(item, depth + 1);
  }
  return out;
}

export class AgentTrace {
  readonly runId: string;
  readonly startedAt: string;
  private readonly entries: TraceEntry[] = [];

  constructor(
    readonly userRequest: string,
    runId: string = randomUUID(),
  ) {
    this.runId = runId;
    this.startedAt = new Date().toISOString();
    this.push({ kind: "run_started", label: "run", detail: userRequest });
  }

  private push(entry: Omit<TraceEntry, "at">): void {
    this.entries.push({ at: new Date().toISOString(), ...entry });
  }

  stateChanged(from: AgentRunState, to: AgentRunState): void {
    this.push({ kind: "state_changed", label: to, detail: `${from} -> ${to}` });
  }

  toolCalled(name: string, args: unknown): void {
    this.push({
      kind: "tool_called",
      label: name,
      data: { args: redact(args) as Record<string, unknown> },
    });
  }

  toolResult(name: string, result: unknown, durationMs: number): void {
    this.push({
      kind: "tool_result",
      label: name,
      durationMs,
      data: { result: redact(result) as Record<string, unknown> },
    });
  }

  toolFailed(name: string, code: string, message: string, durationMs: number): void {
    this.push({ kind: "tool_failed", label: name, detail: `${code}: ${message}`, durationMs });
  }

  decision(reason: DecisionReason, data?: Record<string, unknown>): void {
    this.push({
      kind: "decision",
      label: reason.code,
      detail: reason.statement,
      data: data ? (redact(data) as Record<string, unknown>) : undefined,
    });
  }

  decisions(reasons: DecisionReason[]): void {
    for (const reason of reasons) this.decision(reason);
  }

  approvalRequested(fingerprint: string, summary: string): void {
    this.push({
      kind: "approval_requested",
      label: "human_approval",
      detail: summary,
      data: { offerFingerprint: fingerprint },
    });
  }

  approvalRecorded(granted: boolean, fingerprint: string): void {
    this.push({
      kind: "approval_recorded",
      label: granted ? "approved" : "declined",
      data: { offerFingerprint: fingerprint },
    });
  }

  /**
   * Commitment lifecycle. `data` is redacted like everything else, and the
   * handover secret/salt are never passed in — only the public commit.
   */
  commitment(code: string, detail: string, data?: Record<string, unknown>): void {
    this.push({
      kind: "commitment",
      label: code,
      detail,
      data: data ? (redact(data) as Record<string, unknown>) : undefined,
    });
  }

  /**
   * The model layer. `summary` is a short structured label ("understand_intent",
   * "select_offer"), never chain-of-thought. `data` is redacted like everything
   * else; pass only the structured JSON the model returned, not its prose.
   */
  modelRequest(purpose: string, detail: string): void {
    this.push({ kind: "model_request", label: purpose, detail });
  }

  modelResponse(purpose: string, data: Record<string, unknown>, durationMs?: number): void {
    this.push({
      kind: "model_response",
      label: purpose,
      durationMs,
      data: redact(data) as Record<string, unknown>,
    });
  }

  modelToolSelection(tool: string, args: unknown): void {
    this.push({
      kind: "model_tool_selection",
      label: tool,
      data: { args: redact(args) as Record<string, unknown> },
    });
  }

  modelDecision(code: string, detail: string): void {
    this.push({ kind: "model_decision", label: code, detail });
  }

  modelFallback(purpose: string, code: string, detail: string): void {
    this.push({ kind: "model_fallback", label: purpose, detail: `${code}: ${detail}` });
  }

  /**
   * The candidate-evaluation foundation's verdict for one candidate (M10.9).
   * The trace exposes both the evaluation and the action taken. M10.11 permits
   * only an explicit fulfilment mismatch to exclude; all other evaluation
   * outcomes remain advisory so they can be observed against planning.
   * `summary` is already the trimmed, trace-safe shape
   * (`policy/evaluation.ts`'s `summarizeForTrace`) — nothing here needs its own
   * redaction beyond the standard pass, since that shape carries no sensitive
   * fields to begin with.
   */
  candidateEvaluated(
    summary: CandidateEvaluationSummary,
    policy: {
      queryable: boolean;
      agreesWithPolicy: boolean;
      gate: "EXCLUDED" | "RETAINED_MATCH" | "RETAINED_UNKNOWN" | "RETAINED_ADVISORY";
    },
  ): void {
    this.push({
      kind: "candidate_evaluation",
      label: summary.businessSlug,
      detail: `${summary.overall.status} (${summary.overall.confidence})${
        summary.reasons.length > 0 ? ` — ${summary.reasons.join("; ")}` : ""
      }`,
      data: redact({ ...summary, policy }) as Record<string, unknown>,
    });
  }

  finished(state: AgentRunState, summary: string): void {
    this.push({ kind: "run_finished", label: state, detail: summary });
  }

  toJSON(): {
    runId: string;
    userRequest: string;
    startedAt: string;
    entries: TraceEntry[];
  } {
    return {
      runId: this.runId,
      userRequest: this.userRequest,
      startedAt: this.startedAt,
      entries: [...this.entries],
    };
  }

  get length(): number {
    return this.entries.length;
  }

  entriesOfKind(kind: TraceEntryKind): TraceEntry[] {
    return this.entries.filter((entry) => entry.kind === kind);
  }
}
