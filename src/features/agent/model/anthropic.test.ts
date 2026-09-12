import { beforeEach, describe, expect, it, vi } from "vitest";

import { intentInterpretationSchema } from "./schema";
import { DEFAULT_MODEL_LIMITS } from "./types";

/**
 * AnthropicModelProvider against a mocked SDK client (Part N follow-up).
 *
 * Root cause of the live SCHEMA_MISMATCH bug: the old prompt told the model to
 * "Return ONLY the JSON object named ${schemaName}", which Claude sometimes
 * read as an instruction to wrap the reply in a key named after the schema —
 * `{"IntentInterpretation": {...actual fields...}}` — rather than return the
 * flat object, failing every field's validation at once. It also returned a
 * numeric `confidence` (0.95) instead of the required low/medium/high enum.
 * Both were confirmed live via temporary diagnostic logging on production
 * (2026-09-12), not assumed. The fix forces a tool call whose `input_schema`
 * is generated from the same Zod schema the reply is checked against, so the
 * shape is structurally guaranteed rather than requested in prose.
 */

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { AnthropicModelProvider } = await import("./anthropic");

const VALID_INTENT = {
  service: "print_flyers",
  quantity: 200,
  size: "A4",
  colour: "full-colour",
  deadlineText: "by saturday",
  deliveryArea: "Surulere",
  clarificationNeeded: false,
  clarificationQuestion: null,
  missing: [],
  confidence: "high",
};

// The exact malformed reply captured live from production before the fix.
const HISTORICAL_BROKEN_REPLY = {
  IntentInterpretation: {
    quantity: 200,
    size: "A4",
    colour: "full-colour",
    deadlineText: "by saturday",
    deliveryArea: "Surulere",
    service: "print_flyers",
    missing: [],
    clarificationNeeded: false,
    clarificationQuestion: null,
    confidence: 0.95,
  },
};

function request() {
  return {
    purpose: "understand_intent" as const,
    system: "s",
    user: "u",
    schema: intentInterpretationSchema,
    schemaName: "IntentInterpretation",
  };
}

beforeEach(() => {
  createMock.mockClear();
});

describe("AnthropicModelProvider — forced tool use", () => {
  it("parses a valid tool_use reply directly, with no text/markdown handling needed", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "IntentInterpretation", input: VALID_INTENT }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const provider = new AnthropicModelProvider({ apiKey: "sk-test" });
    const result = await provider.generate(request(), DEFAULT_MODEL_LIMITS);
    expect(result.value.quantity).toBe(200);
    expect(result.value.confidence).toBe("high");
  });

  it("REGRESSION: rejects the historical wrapped-envelope + numeric-confidence reply that caused the live bug", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "IntentInterpretation", input: HISTORICAL_BROKEN_REPLY }],
      usage: {},
    });
    const provider = new AnthropicModelProvider({ apiKey: "sk-test" });
    await expect(provider.generate(request(), DEFAULT_MODEL_LIMITS)).rejects.toMatchObject({
      code: "SCHEMA_MISMATCH",
    });
  });

  it("falls back to parsing markdown-fenced text when the model declines the forced tool call", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(VALID_INTENT) + "\n```" }],
      usage: {},
    });
    const provider = new AnthropicModelProvider({ apiKey: "sk-test" });
    const result = await provider.generate(request(), DEFAULT_MODEL_LIMITS);
    expect(result.value.deliveryArea).toBe("Surulere");
  });

  it("raises EMPTY_RESPONSE when there is neither a tool call nor text", async () => {
    createMock.mockResolvedValueOnce({ content: [], usage: {} });
    const provider = new AnthropicModelProvider({ apiKey: "sk-test" });
    await expect(provider.generate(request(), DEFAULT_MODEL_LIMITS)).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
    });
  });

  it("sends a forced tool_choice and an input_schema with the right enum constraints, no $schema key", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", name: "IntentInterpretation", input: VALID_INTENT }],
      usage: {},
    });
    const provider = new AnthropicModelProvider({ apiKey: "sk-test" });
    await provider.generate(request(), DEFAULT_MODEL_LIMITS);

    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0][0] as {
      tool_choice: unknown;
      tools: { name: string; input_schema: Record<string, unknown> }[];
      system: string;
    };
    expect(callArgs.tool_choice).toEqual({ type: "tool", name: "IntentInterpretation" });
    expect(callArgs.system).toBe("s"); // no more "Return ONLY the JSON object named X" suffix
    const [tool] = callArgs.tools;
    expect(tool.name).toBe("IntentInterpretation");
    expect(tool.input_schema.$schema).toBeUndefined();
    const properties = tool.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(properties.confidence.enum).toEqual(["low", "medium", "high"]);
    expect(tool.input_schema.required).toContain("colour");
  });
});
