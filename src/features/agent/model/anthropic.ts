import { z } from "zod";

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
 * browser. One `messages.create` per call, bounded by `limits`, using a
 * FORCED tool call rather than a prose "reply with JSON" instruction — see
 * `toolInputSchema`. The reply must match the request schema; anything else
 * raises `ModelUnavailableError` and the assisted loop falls back to the
 * deterministic path for that step.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

interface AnthropicOptions {
  apiKey: string;
  model?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

/**
 * Derive the tool's `input_schema` from the same Zod schema the reply is
 * validated against, so the model is structurally constrained to the exact
 * shape `safeParse` expects — not just asked for it in prose.
 *
 * Previously the prompt said "Return ONLY the JSON object named
 * ${schemaName}" and the model replied with plain text, which Claude
 * sometimes read as an instruction to NAME the object rather than describe
 * its shape — producing `{"IntentInterpretation": {...actual fields...}}`
 * instead of the flat object, and failing every field's validation at once
 * (confirmed live via temporary diagnostic logging, 2026-09-12). Forced tool
 * use removes both the naming ambiguity and free-text/markdown parsing
 * entirely: `tool_use.input` is already a parsed object.
 */
function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
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
        content: AnthropicContentBlock[];
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
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          tools: [
            {
              name: request.schemaName,
              description: `Report the ${request.schemaName} result for this task. Call this tool exactly once with your result.`,
              input_schema: toolInputSchema(request.schema),
            },
          ],
          tool_choice: { type: "tool", name: request.schemaName },
        },
        { timeout: limits.timeoutMs },
      );
    } catch (error) {
      throw classify(error);
    }

    const content = response.content ?? [];
    const toolUse = content.find(
      (block) => block.type === "tool_use" && block.name === request.schemaName,
    );

    // Defensive fallback: a model can decline a forced tool call in rare cases
    // (e.g. a safety refusal) and reply with plain text instead. Try to salvage
    // that before giving up, rather than failing a call that actually carried a
    // usable answer.
    let parsed: unknown;
    if (toolUse) {
      parsed = toolUse.input;
    } else {
      const text = content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("")
        .trim();
      if (!text) {
        throw new ModelUnavailableError(
          "EMPTY_RESPONSE",
          "The model returned no tool call and no text.",
        );
      }
      try {
        parsed = extractJsonObject(text);
      } catch {
        throw new ModelUnavailableError("INVALID_JSON", "The model reply was not valid JSON.");
      }
    }

    const checked = request.schema.safeParse(parsed);
    // TEMPORARY DIAGNOSTIC — verifying the forced-tool-use fix against the live
    // SCHEMA_MISMATCH fallback on understand_intent. Logs only the model's own
    // reply and the Zod issue list (already free of secrets/PII); never the API
    // key, headers, or the buyer's request text. Remove once verified live.
    console.log(
      "[model-diagnostic]",
      JSON.stringify({
        purpose: request.purpose,
        model: this.info.model,
        schemaName: request.schemaName,
        usedToolCall: Boolean(toolUse),
        reply: JSON.stringify(parsed).slice(0, 2000),
        zodOk: checked.success,
        zodIssues: checked.success ? undefined : checked.error.issues,
      }),
    );
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
