import { extractJsonObject } from "./prompt";
import {
  ModelUnavailableError,
  type ModelCallLimits,
  type ModelGenerateRequest,
  type ModelGenerateResult,
  type ModelProvider,
  type ModelProviderInfo,
} from "./types";

/**
 * Anthropic-backed model provider.
 *
 * Server-only: the key comes from `ANTHROPIC_API_KEY` and never reaches the
 * browser. One `messages.create` per call, bounded by `limits`. The reply must
 * be a single JSON object matching the request schema; anything else raises
 * `ModelUnavailableError` and the assisted loop falls back to the deterministic
 * path for that step.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

interface AnthropicOptions {
  apiKey: string;
  model?: string;
}

export class AnthropicModelProvider implements ModelProvider {
  readonly info: ModelProviderInfo;
  private client: unknown = null;

  constructor(private readonly options: AnthropicOptions) {
    this.info = {
      provider: "anthropic",
      model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
      available: true,
      worksWithoutCredits: false,
    };
  }

  private async getClient(): Promise<{
    messages: {
      create(
        body: unknown,
        options?: { timeout?: number },
      ): Promise<{
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      }>;
    };
  }> {
    if (!this.client) {
      const mod = await import("@anthropic-ai/sdk");
      const Anthropic = mod.default;
      this.client = new Anthropic({ apiKey: this.options.apiKey, maxRetries: 1 });
    }
    return this.client as never;
  }

  async generate<T>(
    request: ModelGenerateRequest<T>,
    limits: ModelCallLimits,
  ): Promise<ModelGenerateResult<T>> {
    let response;
    try {
      const client = await this.getClient();
      response = await client.messages.create(
        {
          model: this.info.model,
          max_tokens: limits.maxOutputTokens,
          system: `${request.system}\n\nReturn ONLY the JSON object named ${request.schemaName}.`,
          messages: [{ role: "user", content: request.user }],
        },
        { timeout: limits.timeoutMs },
      );
    } catch (error) {
      throw classify(error);
    }

    const text = (response.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("")
      .trim();

    if (!text) {
      throw new ModelUnavailableError("EMPTY_RESPONSE", "The model returned no text.");
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(text);
    } catch {
      throw new ModelUnavailableError("INVALID_JSON", "The model reply was not valid JSON.");
    }

    const checked = request.schema.safeParse(parsed);
    if (!checked.success) {
      throw new ModelUnavailableError(
        "SCHEMA_MISMATCH",
        `The model reply did not match ${request.schemaName}.`,
      );
    }

    return {
      value: checked.data,
      raw: JSON.stringify(checked.data),
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  }
}

function classify(error: unknown): ModelUnavailableError {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : null;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "Unknown model error.";

  if (name === "AbortError" || /timeout|timed out/i.test(message)) {
    return new ModelUnavailableError("TIMEOUT", message);
  }
  if (status === 429) return new ModelUnavailableError("RATE_LIMIT", message);
  return new ModelUnavailableError("PROVIDER_ERROR", message);
}
