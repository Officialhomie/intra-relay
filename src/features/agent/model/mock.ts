import { describeMissingFields, parseBuyerIntent } from "../runtime/intent";
import {
  DEFAULT_MODEL_LIMITS,
  ModelUnavailableError,
  type ModelGenerateRequest,
  type ModelGenerateResult,
  type ModelProvider,
  type ModelProviderInfo,
  type ModelPurpose,
} from "./types";
import { colourEnumFromPhrase } from "./normalize";

/**
 * A deterministic stand-in for a real model, for tests and local dev with no
 * API credits (Part N).
 *
 * `scripts` overrides a purpose with a canned reply — a value, arbitrary raw
 * text (to exercise malformed-JSON / schema-mismatch handling), an error code
 * (timeout, rate limit, provider error), or `{ hang: true }` to never resolve
 * (the caller's own timeout must fire).
 *
 * With no script for a purpose, the mock produces a sensible answer by reading
 * the prompt the assisted loop built — enough to exercise the whole pipeline.
 */

export type MockReply =
  | { value: unknown }
  | { raw: string }
  | { error: ModelUnavailableError["code"] }
  | { hang: true }
  | { delayMs: number };

export type MockScript = Partial<Record<ModelPurpose, MockReply | MockReply[]>>;

export interface MockModelOptions {
  scripts?: MockScript;
  model?: string;
  /** Record every request the loop made, for assertions. */
  calls?: ModelPurpose[];
}

function firstQuoted(text: string): string | null {
  const triple = text.match(/"""([\s\S]*?)"""/);
  if (triple) return triple[1].trim();
  const dq = text.match(/"([^"]{3,})"/);
  return dq ? dq[1] : null;
}

/** Slugs from lines like `- some-slug — Name, City; …`. */
function slugsFromList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^-\s+([a-z0-9-]+)\s+[—-]/i);
    if (m) out.push(m[1]);
  }
  return out;
}

function defaultReply(request: ModelGenerateRequest<unknown>): unknown {
  switch (request.purpose) {
    case "understand_intent": {
      const message = firstQuoted(request.user) ?? request.user;
      const intent = parseBuyerIntent(message);
      const missing: string[] = [];
      if (intent.quantity === null) missing.push("quantity");
      if (!intent.size) missing.push("size");
      if (!intent.colour) missing.push("colour");
      if (!intent.deadline) missing.push("deadline");
      if (!intent.deliveryArea) missing.push("deliveryArea");
      const looksLikePrinting = /\b(flyer|flier|leaflet|poster|print|copie)/i.test(message);
      return {
        service: looksLikePrinting ? "print_flyers" : "other",
        quantity: intent.quantity,
        size: intent.size,
        colour: colourEnumFromPhrase(intent.colour),
        deadlineText: intent.deadline ? "as originally stated" : null,
        deliveryArea: intent.deliveryArea,
        clarificationNeeded: missing.length > 0,
        clarificationQuestion: missing.length > 0 ? describeMissingFields(missing) : null,
        missing,
        confidence: missing.length === 0 ? "high" : "medium",
      };
    }
    case "plan_quotes": {
      const slugs = slugsFromList(request.user);
      return {
        quote: slugs.map((businessSlug) => ({
          businessSlug,
          reason: "Fresh price and an acceptable response time.",
        })),
        skip: [],
        note: `Requesting ${slugs.length} comparable quote(s).`,
      };
    }
    case "select_offer": {
      const slugs = slugsFromList(request.user);
      return {
        selectedBusinessSlug: slugs[0] ?? "",
        reason: "Best balance of price and turnaround among the eligible quotes.",
        tradeoffs: slugs.length > 1 ? ["Other quotes were close on price."] : [],
        uncertainties: ["Intra has not independently verified this price or turnaround."],
      };
    }
    case "replan":
      return {
        action: "stop",
        requoteBusinessSlugs: [],
        reason: "No further providers are worth a fee right now.",
      };
    default:
      return {};
  }
}

async function applyReply<T>(
  reply: MockReply,
  request: ModelGenerateRequest<T>,
  limits: { timeoutMs: number },
): Promise<ModelGenerateResult<T>> {
  if ("hang" in reply) {
    await new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new ModelUnavailableError("TIMEOUT", "Mock model never responded.")),
        limits.timeoutMs,
      );
    });
    throw new ModelUnavailableError("TIMEOUT", "unreachable");
  }
  if ("delayMs" in reply) {
    await new Promise((r) => setTimeout(r, reply.delayMs));
    return finalize(defaultReply(request as ModelGenerateRequest<unknown>), request);
  }
  if ("error" in reply) {
    throw new ModelUnavailableError(reply.error, `Mock model error: ${reply.error}`);
  }
  if ("raw" in reply) {
    const parsed = safeParse(reply.raw);
    const check = request.schema.safeParse(parsed);
    if (!check.success) {
      throw new ModelUnavailableError(
        parsed === undefined ? "INVALID_JSON" : "SCHEMA_MISMATCH",
        "Mock model returned text that does not match the schema.",
      );
    }
    return { value: check.data, raw: reply.raw, usage: { inputTokens: null, outputTokens: null } };
  }
  return finalize(reply.value, request);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function finalize<T>(value: unknown, request: ModelGenerateRequest<T>): ModelGenerateResult<T> {
  const check = request.schema.safeParse(value);
  if (!check.success) {
    throw new ModelUnavailableError(
      "SCHEMA_MISMATCH",
      `Mock reply for ${request.purpose} did not match ${request.schemaName}.`,
    );
  }
  return {
    value: check.data,
    raw: JSON.stringify(value),
    usage: { inputTokens: 10, outputTokens: 10 },
  };
}

export class MockModelProvider implements ModelProvider {
  readonly info: ModelProviderInfo;
  private readonly cursors: Partial<Record<ModelPurpose, number>> = {};

  constructor(private readonly options: MockModelOptions = {}) {
    this.info = {
      provider: "mock",
      model: options.model ?? "mock-model",
      available: true,
      worksWithoutCredits: true,
    };
  }

  async generate<T>(
    request: ModelGenerateRequest<T>,
    limits = DEFAULT_MODEL_LIMITS,
  ): Promise<ModelGenerateResult<T>> {
    this.options.calls?.push(request.purpose);

    const scripted = this.options.scripts?.[request.purpose];
    let reply: MockReply | undefined;
    if (Array.isArray(scripted)) {
      const i = this.cursors[request.purpose] ?? 0;
      reply = scripted[Math.min(i, scripted.length - 1)];
      this.cursors[request.purpose] = i + 1;
    } else {
      reply = scripted;
    }

    if (!reply) return finalize(defaultReply(request as ModelGenerateRequest<unknown>), request);
    return applyReply(reply, request, limits);
  }
}
