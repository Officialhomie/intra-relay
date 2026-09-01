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
 */

export interface ToolContext {
  http: AgentHttpClient;
  agentId: string;
}

export interface ToolResult<T> {
  ok: boolean;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AgentTool<I, O> {
  name: string;
  description: string;
  input: z.ZodType<I>;
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
      })),
    );
  },
};

// --- getBusinessCapabilities ----------------------------------------------

const capabilitiesInput = z.object({
  businessSlug: z.string().trim().min(1),
  routeSlug: z.string().trim().min(1).default(FLYER_PRINTING_ROUTE_SLUG),
});

interface CapabilityDoc {
  business?: { name?: string; city?: string | null; country?: string | null };
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
      city: doc?.business?.city ?? null,
      country: doc?.business?.country ?? null,
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
  mutating: true,
  async run(input, { http, agentId }) {
    const result = await http.request<{
      outcome?: string;
      taskId?: string;
      responseSlaMinutes?: number;
    }>(
      "POST",
      `/v1/${encodeURIComponent(input.businessSlug)}/${encodeURIComponent(input.routeSlug)}/quote`,
      { body: { requester: agentId, input: input.brief }, idempotent: true },
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

interface TaskView {
  task?: { id: string; status: string };
  business?: { name?: string; slug?: string };
  route?: { slug?: string };
  quote?: {
    status?: string;
    currency?: string;
    amountMin?: number | string;
    amountMax?: number | string | null;
    deliveryCharge?: number | string | null;
    fixed?: boolean;
    turnaround?: string;
    confidence?: "low" | "medium" | "high" | null;
    expiresAt?: string | null;
    availabilityNote?: string | null;
    declineReason?: string | null;
  } | null;
}

export interface QuoteStatus {
  taskId: string;
  taskStatus: string;
  offer: ProviderOffer | null;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getQuoteStatus: AgentTool<z.infer<typeof quoteStatusInput>, QuoteStatus> = {
  name: "getQuoteStatus",
  description:
    "Check whether a printer has answered a quote request yet, and read the quote if they have. " +
    "A task still AWAITING_QUOTE means no human has responded — that is expected, not an error.",
  input: quoteStatusInput,
  mutating: false,
  async run(input, { http }) {
    const result = await http.request<TaskView>(
      "GET",
      `/api/tasks/${encodeURIComponent(input.taskId)}`,
      { session: true },
    );
    if (!result.ok) return fail(result.errorCode!, result.errorMessage!);

    const view = result.data;
    const quote = view?.quote ?? null;
    const taskStatus = view?.task?.status ?? "UNKNOWN";

    if (!quote || !quote.status) {
      return succeed({ taskId: input.taskId, taskStatus, offer: null });
    }

    return succeed({
      taskId: input.taskId,
      taskStatus,
      offer: {
        businessSlug: view?.business?.slug ?? "",
        businessName: view?.business?.name ?? "",
        routeSlug: view?.route?.slug ?? FLYER_PRINTING_ROUTE_SLUG,
        taskId: input.taskId,
        status: quote.status as ProviderOffer["status"],
        currency: quote.currency ?? "NGN",
        amountMin: num(quote.amountMin),
        amountMax: quote.amountMax == null ? null : num(quote.amountMax),
        deliveryCharge: quote.deliveryCharge == null ? null : num(quote.deliveryCharge),
        fixed: quote.fixed === true,
        turnaround: quote.turnaround ?? "",
        confidence: quote.confidence ?? null,
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
 * something it may decide alone.
 */
export const recordBuyerDecision: AgentTool<z.infer<typeof decisionInput>, unknown> = {
  name: "recordBuyerDecision",
  description:
    "Record the buyer's OWN accept/decline decision on a quote. The agent must never decide this " +
    "itself — call it only after a human has explicitly approved the exact offer shown to them. " +
    "Accepting reveals a pre-filled WhatsApp message; it does not place an order or move money.",
  input: decisionInput,
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
