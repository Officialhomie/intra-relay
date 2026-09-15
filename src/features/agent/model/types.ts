import type { z } from "zod";

/**
 * The model layer (milestone 3).
 *
 * The model sits ABOVE the deterministic orchestration, never inside it. It is
 * given a system prompt and a serialised snapshot of state, and must reply with
 * JSON matching a Zod schema. It has no direct tool handle, no network, no
 * database. Every reply is validated; an invalid or missing reply falls back to
 * the deterministic path (`runBuyerAgent`).
 */

export interface ModelProviderInfo {
  /** "anthropic" | "mock" | "none" */
  provider: string;
  model: string;
  /** True when a real call can be made right now (key present, or it is the mock). */
  available: boolean;
  /** True when the layer works in tests/CI with no API credits (the mock). */
  worksWithoutCredits: boolean;
}

/** Bounds every model call. The agent must have a hard upper bound (Part M). */
export interface ModelCallLimits {
  /** Max model generations in one agent run. */
  maxCallsPerRun: number;
  /** Serialised prompt input is truncated to this many characters. */
  maxInputChars: number;
  /** Upper bound on output tokens per call. */
  maxOutputTokens: number;
  /** Per-call timeout. */
  timeoutMs: number;
}

export const DEFAULT_MODEL_LIMITS: ModelCallLimits = {
  maxCallsPerRun: 4,
  maxInputChars: 6_000,
  maxOutputTokens: 700,
  timeoutMs: 12_000,
};

export type ModelPurpose =
  "understand_intent" | "plan_quotes" | "select_offer" | "replan" | "classify_conversation";

export interface ModelGenerateRequest<T> {
  purpose: ModelPurpose;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Short name for the JSON object the model must return. */
  schemaName: string;
}

export interface ModelGenerateResult<T> {
  value: T;
  /** Raw text the model produced, for the trace (never chain-of-thought — a JSON object). */
  raw: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface ModelProvider {
  readonly info: ModelProviderInfo;
  generate<T>(
    request: ModelGenerateRequest<T>,
    limits: ModelCallLimits,
  ): Promise<ModelGenerateResult<T>>;
}

/** Thrown for any model failure: timeout, rate limit, bad JSON, provider error. */
export class ModelUnavailableError extends Error {
  constructor(
    readonly code:
      | "NO_PROVIDER"
      | "TIMEOUT"
      | "RATE_LIMIT"
      | "PROVIDER_ERROR"
      | "INVALID_JSON"
      | "SCHEMA_MISMATCH"
      | "EMPTY_RESPONSE"
      | "CALL_BUDGET_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}
