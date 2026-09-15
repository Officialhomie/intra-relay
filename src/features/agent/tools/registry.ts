import { z } from "zod";

import { FLYER_PRINTING_ROUTE_SLUG } from "@/features/routes/flyer-printing";

import type { AgentHttpClient } from "./client";
import type { ProviderCandidate, ProviderOffer } from "../types";

/**
 * The buyer agent's tool surface.
 *
 * Only tools the current system genuinely supports are declared. There is no
 * `payProvider` and no `placeOrder` — the agent cannot do either, by design
 * (BR-001), and declaring a tool the agent must never call is how an LLM ends
 * up calling it.
 *
 * Every tool carries an explicit input AND output schema (`z`), so the model
 * layer (milestone 3) is handed a typed contract, never an arbitrary-function
 * interface. `mode` tells the runtime whether a proposed call needs the
 * mutating-action guard; the model is only ever shown the `"read"` subset plus
 * `requestQuote` (see `MODEL_TOOLS`), and never `recordBuyerDecision`.
 */

export interface ToolContext {
  http: AgentHttpClient;
  agentId: string;
  /**
   * The human buyer's browser session this run belongs to (milestone 6 §17).
   * Passed to the quote API as the task's buyer claim so the human can act on
   * their own agent-created order. Undefined for runs with no human session.
   */
  buyerSessionId?: string;
}

export interface ToolResult<T> {
  ok: boolean;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type ToolMode = "read" | "mutating";

export interface AgentTool<I, O> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  mode: ToolMode;
  /** True when the tool can move money or state. Used by the runtime's guards. */
  mutating: boolean;
  run(input: I, context: ToolContext): Promise<ToolResult<O>>;
}

function fail<T>(code: string, message: string): ToolResult<T> {
  return { ok: false, data: null, errorCode: code, errorMessage: message };
}

function succeed<T>(data: T): ToolResult<T> {
  return { ok: true, data, errorCode: null, errorMessage: null };
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// --- shared output schemas ----------------------------------------------------

const availabilitySchema = z
  .object({
    state: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    acceptingQuoteRequests: z.boolean(),
    reason: z.string(),
    detail: z.string(),
  })
  .nullable();

const freshnessSchema = z
  .object({
    priceConfirmedAt: z.string().nullable(),
    staleAfter: z.string().nullable(),
    stale: z.boolean(),
  })
  .nullable();

const paymentSchema = z
  .object({
    queryFeeUsd: z.number(),
    available: z.boolean(),
    state: z.string(),
  })
  .nullable();

const providerCandidateSchema = z.object({
  businessSlug: z.string(),
  businessName: z.string(),
  routeSlug: z.string(),
  routeName: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  responseSlaMinutes: z.number().nullable(),
  quoteCurrency: z.string().nullable(),
  priceUpdatedAt: z.string().nullable(),
  availability: availabilitySchema,
  freshness: freshnessSchema,
  payment: paymentSchema,
  serviceArea: z.string().nullable(),
  fulfillment: z
    .object({
      pickupAvailable: z.boolean().nullable(),
      deliveryAvailable: z.boolean().nullable(),
    })
    .nullable(),
  typicalTurnaround: z.string().nullable(),
}) satisfies z.ZodType<ProviderCandidate>;

const providerOfferSchema = z.object({
  businessSlug: z.string(),
  businessName: z.string(),
  routeSlug: z.string(),
  taskId: z.string(),
  status: z.enum(["RECEIVED", "DECLINED", "EXPIRED"]),
  currency: z.string(),
  amountMin: z.number(),
  amountMax: z.number().nullable(),
  deliveryCharge: z.number().nullable(),
  fixed: z.boolean(),
  turnaround: z.string(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  availabilityNote: z.string().nullable(),
  declineReason: z.string().nullable(),
}) satisfies z.ZodType<ProviderOffer>;

// --- discoverProviders -----------------------------------------------------

const discoverInput = z.object({
  routeSlug: z.string().trim().min(1).default(FLYER_PRINTING_ROUTE_SLUG),
});

interface ActiveRouteRow {
  routeSlug: string;
  routeName: string;
  responseSlaMinutes: number | null;
  priceUpdatedAt: string | null;
  quoteCurrency: string | null;
  businessSlug: string;
  businessName: string;
  city: string | null;
  country: string | null;
}

export const discoverProviders: AgentTool<z.infer<typeof discoverInput>, ProviderCandidate[]> = {
  name: "discoverProviders",
  description:
    "List providers with an ACTIVE route for a given capability (default: flyer printing). " +
    "Returns candidates without prices — availability and freshness require reading each capability document.",
  input: discoverInput,
  output: z.array(providerCandidateSchema),
  mode: "read",
  mutating: false,
  async run(input, { http }) {
    const result = await http.request<ActiveRouteRow[]>(
      "GET",
      `/api/routes/active?routeSlug=${encodeURIComponent(input.routeSlug)}`,
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);

    const rows = Array.isArray(result.data) ? result.data : [];
    return succeed(
      rows.map<ProviderCandidate>((row) => ({
        businessSlug: row.businessSlug,
        businessName: row.businessName,
        routeSlug: row.routeSlug,
        routeName: row.routeName,
        city: row.city,
        country: row.country,
        responseSlaMinutes: row.responseSlaMinutes,
        quoteCurrency: row.quoteCurrency,
        priceUpdatedAt: row.priceUpdatedAt,
        availability: null,
        freshness: null,
        payment: null,
        // Not yet read — only the capability document (getBusinessCapabilities)
        // carries these (M10.8), same convention as availability/freshness above.
        serviceArea: null,
        fulfillment: null,
        typicalTurnaround: null,
      })),
    );
  },
};

// --- getBusinessCapabilities ----------------------------------------------

const capabilitiesInput = z.object({
  businessSlug: z.string().trim().min(1),
  routeSlug: z.string().trim().min(1).default(FLYER_PRINTING_ROUTE_SLUG),
});

/**
 * The public capability document shape actually returned by
 * `GET /v1/:slug/capabilities` (`buildBusinessCapabilities`). Kept narrow: only
 * the fields the agent reads. Note `business.location.{city,country}` — the
 * document nests location, and an earlier version of this tool read a flat
 * `business.city` that never existed on the wire.
 */
interface CapabilityDoc {
  business?: {
    name?: string;
    location?: { city?: string | null; country?: string | null };
  };
  routes?: Array<{
    slug: string;
    name: string;
    responseSlaMinutes?: number | null;
    availability?: ProviderCandidate["availability"];
    freshness?: {
      priceConfirmedAt: string | null;
      staleAfter: string | null;
      stale: boolean;
    };
    payment?: { queryFeeUsd: number; available: boolean; state: string };
    serviceArea?: string | null;
    fulfillment?: { pickupAvailable: boolean | null; deliveryAvailable: boolean | null } | null;
    typicalTurnaround?: string | null;
  }>;
}

/**
 * Reads the capability document and returns the *enriched* candidate — the
 * agent's PERCEIVE step. Availability, freshness and query fee all come from
 * here; nothing is inferred.
 */
export const getBusinessCapabilities: AgentTool<
  z.infer<typeof capabilitiesInput>,
  ProviderCandidate | null
> = {
  name: "getBusinessCapabilities",
  description:
    "Read a business's public capability document: current availability, price freshness, " +
    "quote SLA and any agent query fee. Read this before deciding whether to spend a fee.",
  input: capabilitiesInput,
  output: providerCandidateSchema.nullable(),
  mode: "read",
  mutating: false,
  async run(input, { http }) {
    const result = await http.request<CapabilityDoc>(
      "GET",
      `/v1/${encodeURIComponent(input.businessSlug)}/capabilities`,
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);

    const doc = result.data;
    const route = doc?.routes?.find((entry) => entry.slug === input.routeSlug);
    if (!route) {
      return fail(
        "ROUTE_NOT_IN_CAPABILITIES",
        `${input.businessSlug} publishes no "${input.routeSlug}" route.`,
      );
    }

    return succeed({
      businessSlug: input.businessSlug,
      businessName: doc?.business?.name ?? input.businessSlug,
      routeSlug: route.slug,
      routeName: route.name,
      city: doc?.business?.location?.city ?? null,
      country: doc?.business?.location?.country ?? null,
      responseSlaMinutes: route.responseSlaMinutes ?? null,
      quoteCurrency: null,
      priceUpdatedAt: route.freshness?.priceConfirmedAt ?? null,
      availability: route.availability ?? null,
      freshness: route.freshness ?? null,
      payment: route.payment
        ? {
            queryFeeUsd: route.payment.queryFeeUsd,
            available: route.payment.available,
            state: route.payment.state,
          }
        : null,
      serviceArea: route.serviceArea ?? null,
      fulfillment: route.fulfillment ?? null,
      typicalTurnaround: route.typicalTurnaround ?? null,
    });
  },
};

// --- requestQuote ----------------------------------------------------------

const requestQuoteInput = z.object({
  businessSlug: z.string().trim().min(1),
  routeSlug: z.string().trim().min(1).default(FLYER_PRINTING_ROUTE_SLUG),
  brief: z.record(z.string(), z.unknown()),
});

export interface QuoteRequestAccepted {
  taskId: string;
  outcome: string;
  responseSlaMinutes: number | null;
}

const quoteRequestAcceptedSchema = z.object({
  taskId: z.string(),
  outcome: z.string(),
  responseSlaMinutes: z.number().nullable(),
}) satisfies z.ZodType<QuoteRequestAccepted>;

/**
 * Posts a structured quote request. This does NOT return a price: a human has
 * to answer. A 202 means the request is queued against the printer's SLA — the
 * agent must then wait and poll, which is the honest shape of the transaction.
 */
export const requestQuote: AgentTool<z.infer<typeof requestQuoteInput>, QuoteRequestAccepted> = {
  name: "requestQuote",
  description:
    "Submit a structured quote request to one provider. Returns a taskId, NOT a price — " +
    "a human printer answers asynchronously within their stated SLA. Poll getQuoteStatus afterwards.",
  input: requestQuoteInput,
  output: quoteRequestAcceptedSchema,
  mode: "mutating",
  mutating: true,
  async run(input, { http, agentId, buyerSessionId }) {
    const result = await http.request<{
      outcome?: string;
      taskId?: string;
      responseSlaMinutes?: number;
    }>(
      "POST",
      `/v1/${encodeURIComponent(input.businessSlug)}/${encodeURIComponent(input.routeSlug)}/quote`,
      {
        body: {
          requester: agentId,
          ...(buyerSessionId ? { buyerClaim: buyerSessionId } : {}),
          input: input.brief,
        },
        idempotent: true,
      },
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);
    if (!result.data?.taskId) {
      return fail("NO_TASK_ID", "The quote endpoint accepted the request but returned no taskId.");
    }
    return succeed({
      taskId: result.data.taskId,
      outcome: result.data.outcome ?? "AWAITING_QUOTE",
      responseSlaMinutes: result.data.responseSlaMinutes ?? null,
    });
  },
};

// --- getQuoteStatus --------------------------------------------------------

const quoteStatusInput = z.object({ taskId: z.string().trim().min(1) });

/**
 * The shape `GET /api/tasks/:id` actually returns (`getTaskView`): a `quotes`
 * ARRAY (not a singular `quote`), a `supplier` object (not `business`), and the
 * route slug under `route`. An earlier version of this tool read a `view.quote`
 * / `view.business` shape that the endpoint has never produced.
 */
interface TaskView {
  task?: { id?: string; status?: string };
  route?: { slug?: string | null } | null;
  supplier?: { name?: string | null } | null;
  quotes?: Array<{
    status?: string;
    effectiveStatus?: string;
    currency?: string;
    amountMin?: number | string;
    amountMax?: number | string | null;
    deliveryCharge?: number | string | null;
    fixed?: boolean;
    turnaround?: string;
    confidence?: "low" | "medium" | "high" | null;
    createdAt?: string | null;
    expiresAt?: string | null;
    availabilityNote?: string | null;
    declineReason?: string | null;
  }>;
}

export interface QuoteStatus {
  taskId: string;
  taskStatus: string;
  offer: ProviderOffer | null;
}

const quoteStatusSchema = z.object({
  taskId: z.string(),
  taskStatus: z.string(),
  offer: providerOfferSchema.nullable(),
}) satisfies z.ZodType<QuoteStatus>;

function offerStatus(raw: string | undefined): ProviderOffer["status"] {
  if (raw === "DECLINED") return "DECLINED";
  if (raw === "EXPIRED") return "EXPIRED";
  return "RECEIVED";
}

export const getQuoteStatus: AgentTool<z.infer<typeof quoteStatusInput>, QuoteStatus> = {
  name: "getQuoteStatus",
  description:
    "Check whether a printer has answered a quote request yet, and read the quote if they have. " +
    "A task still AWAITING_QUOTE means no human has responded — that is expected, not an error.",
  input: quoteStatusInput,
  output: quoteStatusSchema,
  mode: "read",
  mutating: false,
  async run(input, { http }) {
    const result = await http.request<TaskView>(
      "GET",
      `/api/tasks/${encodeURIComponent(input.taskId)}`,
      { session: true },
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);

    const view = result.data;
    const taskStatus = view?.task?.status ?? "UNKNOWN";
    const quote = Array.isArray(view?.quotes) ? (view.quotes[0] ?? null) : null;

    // `effectiveStatus` already accounts for a RECEIVED quote whose expiry has
    // passed; fall back to the stored status.
    const status = quote ? (quote.effectiveStatus ?? quote.status) : null;
    if (!quote || !status || status === "PENDING") {
      return succeed({ taskId: input.taskId, taskStatus, offer: null });
    }

    return succeed({
      taskId: input.taskId,
      taskStatus,
      offer: {
        // Business slug is not on the task view; the loop stamps the real
        // slug/name from the candidate it asked. Name here is best-effort.
        businessSlug: "",
        businessName: view?.supplier?.name ?? "",
        routeSlug: view?.route?.slug ?? FLYER_PRINTING_ROUTE_SLUG,
        taskId: input.taskId,
        status: offerStatus(status),
        currency: quote.currency ?? "NGN",
        amountMin: num(quote.amountMin),
        amountMax: quote.amountMax == null ? null : num(quote.amountMax),
        deliveryCharge: quote.deliveryCharge == null ? null : num(quote.deliveryCharge),
        fixed: quote.fixed === true,
        turnaround: quote.turnaround ?? "",
        confidence: quote.confidence ?? null,
        issuedAt: quote.createdAt ?? null,
        expiresAt: quote.expiresAt ?? null,
        availabilityNote: quote.availabilityNote ?? null,
        declineReason: quote.declineReason ?? null,
      },
    });
  },
};

// --- recordBuyerDecision ---------------------------------------------------

const decisionInput = z.object({
  taskId: z.string().trim().min(1),
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Records the decision a HUMAN made. The runtime will not call this without a
 * matching approval (see `policy/approval.ts`); the tool itself carries the
 * same warning so an LLM reading the description cannot mistake it for
 * something it may decide alone. It is deliberately absent from `MODEL_TOOLS`.
 */
export const recordBuyerDecision: AgentTool<z.infer<typeof decisionInput>, unknown> = {
  name: "recordBuyerDecision",
  description:
    "Record the buyer's OWN accept/decline decision on a quote. The agent must never decide this " +
    "itself — call it only after a human has explicitly approved the exact offer shown to them. " +
    "Accepting reveals a pre-filled WhatsApp message; it does not place an order or move money.",
  input: decisionInput,
  output: z.unknown(),
  mode: "mutating",
  mutating: true,
  async run(input, { http }) {
    const result = await http.request<unknown>(
      "POST",
      `/api/tasks/${encodeURIComponent(input.taskId)}/decision`,
      {
        body: { decision: input.decision, ...(input.reason ? { reason: input.reason } : {}) },
        idempotent: true,
        session: true,
      },
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);
    return succeed(result.data);
  },
};

export const AGENT_TOOLS = {
  discoverProviders,
  getBusinessCapabilities,
  requestQuote,
  getQuoteStatus,
  recordBuyerDecision,
} as const;

export type AgentToolName = keyof typeof AGENT_TOOLS;

/**
 * The subset a model may propose calls against. `recordBuyerDecision` is
 * excluded on purpose (BR-001) — a human approval, validated deterministically,
 * is the only path to it. `discoverProviders` is also excluded: discovery is
 * run once deterministically so the model always reasons over the full set.
 */
export const MODEL_TOOLS = {
  getBusinessCapabilities,
  requestQuote,
  getQuoteStatus,
} as const;

export type ModelToolName = keyof typeof MODEL_TOOLS;

export const MODEL_TOOL_NAMES = Object.keys(MODEL_TOOLS) as ModelToolName[];

/** A JSON-schema view of the model-facing tools, for the system prompt. */
export function describeToolsForModel(): Array<{
  name: string;
  description: string;
  mode: ToolMode;
  inputSchema: unknown;
}> {
  return MODEL_TOOL_NAMES.map((name) => {
    const tool = MODEL_TOOLS[name];
    return {
      name: tool.name,
      description: tool.description,
      mode: tool.mode,
      inputSchema: z.toJSONSchema(tool.input),
    };
  });
}
