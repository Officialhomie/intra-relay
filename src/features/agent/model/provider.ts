import { AnthropicModelProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { MockModelProvider } from "./mock";
import type { ModelProvider } from "./types";

/**
 * Resolve the model provider from the environment.
 *
 *   AGENT_MODEL_PROVIDER = "anthropic" | "mock" | "off"   (optional)
 *   ANTHROPIC_API_KEY    = <key>                          (server-only)
 *   AGENT_MODEL          = <model id>                     (optional override)
 *
 * Default (unset): use Anthropic when `ANTHROPIC_API_KEY` is present, otherwise
 * return `null` — the assisted loop then runs fully deterministically. Nothing
 * here throws: a missing key is a normal, supported state.
 */

export interface ResolvedModel {
  provider: ModelProvider | null;
  info: {
    provider: string;
    model: string;
    configured: boolean;
    worksWithoutCredits: boolean;
    reason: string;
  };
}

export function resolveModelProvider(env: NodeJS.ProcessEnv = process.env): ResolvedModel {
  const mode = (env.AGENT_MODEL_PROVIDER ?? "").trim().toLowerCase();
  const model = env.AGENT_MODEL?.trim() || undefined;

  if (mode === "off") {
    return {
      provider: null,
      info: {
        provider: "none",
        model: "-",
        configured: false,
        worksWithoutCredits: true,
        reason: "AGENT_MODEL_PROVIDER=off — the agent runs deterministically.",
      },
    };
  }

  if (mode === "mock") {
    const provider = new MockModelProvider({ model: model ?? "mock-model" });
    return {
      provider,
      info: {
        provider: "mock",
        model: provider.info.model,
        configured: true,
        worksWithoutCredits: true,
        reason: "AGENT_MODEL_PROVIDER=mock — deterministic stand-in, no API credits used.",
      },
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    const provider = new AnthropicModelProvider({ apiKey, model });
    return {
      provider,
      info: {
        provider: "anthropic",
        model: provider.info.model,
        configured: true,
        worksWithoutCredits: false,
        reason: "ANTHROPIC_API_KEY is set.",
      },
    };
  }

  return {
    provider: null,
    info: {
      provider: "none",
      model: model ?? DEFAULT_ANTHROPIC_MODEL,
      configured: false,
      worksWithoutCredits: true,
      reason: "No ANTHROPIC_API_KEY — the assisted loop falls back to the deterministic path.",
    },
  };
}

export { MockModelProvider } from "./mock";
export { AnthropicModelProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
