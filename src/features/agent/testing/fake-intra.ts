import { AgentHttpClient } from "../tools/client";
import type { ToolContext } from "../tools/registry";
import type { AgentRunOptions } from "../runtime/loop";
import type { ProviderOffer } from "../types";

/**
 * A fake Intra HTTP surface for agent tests. Emits the SAME JSON shapes the real
 * routes emit (`getTaskView` returns `quotes[]` + `supplier`; the capability
 * document nests `business.location`) so a test that passes here is a test the
 * live server would pass.
 */

export interface FakePrinter {
  slug: string;
  name: string;
  available?: boolean;
  reason?: string;
  stale?: boolean;
  queryFeeUsd?: number;
  paymentAvailable?: boolean;
  sla?: number;
  priceConfirmedAt?: string;
  /** null = never answers within the wait window. */
  quote?: Partial<ProviderOffer> | null;
  /** Answers only on/after the Nth poll (simulates a slow human). */
  answersOnPoll?: number;
  quoteAcceptError?: { status: number; code: string };
  capabilitiesError?: boolean;
}

export interface FakeIntraOptions {
  hang?: boolean;
  garbage?: boolean;
  commitmentFails?: boolean;
}

export const FAKE_BASE = "https://intra.test";
export const FAKE_NOW = new Date("2026-09-01T09:00:00.000Z");

export function fakeIntra(printers: FakePrinter[], opts: FakeIntraOptions = {}) {
  const decisions: { taskId: string; decision: string; reason?: string }[] = [];
  const attestations: string[] = [];
  const quoteRequests: string[] = [];
  const pollCounts = new Map<string, number>();
  const taskFor = new Map<string, FakePrinter>();

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;

    if (opts.hang) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted) return abort();
        signal?.addEventListener("abort", abort, { once: true });
      });
    }

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    const okJson = (data: unknown, status = 200) => json({ success: true, data }, status);
    const errJson = (code: string, status: number) =>
      json({ success: false, error: { code, message: code } }, status);

    if (path === "/api/routes/active") {
      if (opts.garbage) return new Response("<html>not json</html>", { status: 200 });
      return okJson(
        printers.map((p) => ({
          routeId: `route_${p.slug}`,
          routeSlug: "flyer-printing",
          routeName: "Flyer printing quote",
          responseSlaMinutes: p.sla ?? 60,
          priceUpdatedAt: p.priceConfirmedAt ?? "2026-08-31T09:00:00.000Z",
          quoteCurrency: "NGN",
          businessSlug: p.slug,
          businessName: p.name,
          city: "Lagos",
          country: "Nigeria",
        })),
      );
    }

    const capMatch = path.match(/^\/v1\/([^/]+)\/capabilities$/);
    if (capMatch) {
      const p = printers.find((x) => x.slug === capMatch[1]);
      if (!p || p.capabilitiesError) return errJson("BUSINESS_NOT_FOUND", 404);
      const available = p.available !== false;
      const fee = p.queryFeeUsd ?? 0;
      const paymentAvailable = fee <= 0 || p.paymentAvailable !== false;
      return okJson({
        version: "0.2",
        business: { name: p.name, location: { city: "Lagos", country: "Nigeria" } },
        routes: [
          {
            slug: "flyer-printing",
            name: "Flyer printing quote",
            responseSlaMinutes: p.sla ?? 60,
            availability: {
              state: available ? "AVAILABLE" : "UNAVAILABLE",
              acceptingQuoteRequests: available,
              reason: p.reason ?? (available ? "READY" : "NOT_ACTIVE"),
              detail: available ? "Active and fresh." : "Route is paused.",
            },
            freshness: {
              priceConfirmedAt: p.priceConfirmedAt ?? "2026-08-31T09:00:00.000Z",
              maxAgeDays: 14,
              staleAfter: "2026-09-14T09:00:00.000Z",
              stale: p.stale === true,
            },
            payment: {
              queryFeeUsd: fee,
              maxFeeUsd: 0.05,
              available: paymentAvailable,
              state: paymentAvailable ? "AVAILABLE" : "PAYMENT_SERVICE_UNAVAILABLE",
            },
          },
        ],
      });
    }

    const quoteMatch = path.match(/^\/v1\/([^/]+)\/([^/]+)\/quote$/);
    if (quoteMatch && init?.method === "POST") {
      const p = printers.find((x) => x.slug === quoteMatch[1])!;
      if (p.quoteAcceptError) return errJson(p.quoteAcceptError.code, p.quoteAcceptError.status);
      const taskId = `task_${p.slug}`;
      taskFor.set(taskId, p);
      quoteRequests.push(p.slug);
      return okJson({ outcome: "AWAITING_QUOTE", taskId, responseSlaMinutes: p.sla ?? 60 }, 202);
    }

    const decisionMatch = path.match(/^\/api\/tasks\/([^/]+)\/decision$/);
    if (decisionMatch && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { decision: string; reason?: string };
      decisions.push({ taskId: decisionMatch[1], decision: body.decision, reason: body.reason });
      return okJson({ task: { status: "HANDOFF_READY" }, decision: `${body.decision}ED` });
    }

    const commitmentMatch = path.match(/^\/api\/tasks\/([^/]+)\/commitment$/);
    if (commitmentMatch && init?.method === "POST") {
      if (opts.commitmentFails) return errJson("EAS_UNAVAILABLE", 503);
      attestations.push(commitmentMatch[1]);
      return okJson({
        taskId: commitmentMatch[1],
        status: "ATTESTED",
        jobRef: `0x${"1".repeat(64)}`,
        handoverCommit: `0x${"2".repeat(64)}`,
        validUntil: "2026-09-05T00:00:00.000Z",
        attestationUid: `0x${"3".repeat(64)}`,
        attestationTxHash: null,
        attestationMode: "mock",
        mode: "mock",
        simulated: true,
        wrote: true,
      });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const p = taskFor.get(taskMatch[1]);
      if (!p) return errJson("TASK_NOT_FOUND", 404);
      const seen = (pollCounts.get(taskMatch[1]) ?? 0) + 1;
      pollCounts.set(taskMatch[1], seen);
      const ready = p.quote != null && seen >= (p.answersOnPoll ?? 1);
      if (!ready) {
        return okJson({
          task: { id: taskMatch[1], status: "AWAITING_QUOTE" },
          route: { slug: "flyer-printing" },
          supplier: null,
          quotes: [],
        });
      }
      const quote = {
        status: "RECEIVED",
        effectiveStatus: "RECEIVED",
        currency: "NGN",
        amountMin: 45_000,
        amountMax: null,
        deliveryCharge: 0,
        fixed: true,
        turnaround: "24 hours",
        confidence: "high",
        createdAt: "2026-09-01T08:30:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        ...p.quote,
      };
      return okJson({
        task: { id: taskMatch[1], status: "RECOMMENDED" },
        route: { slug: "flyer-printing" },
        supplier: { name: p.name },
        quotes: [quote],
      });
    }

    return errJson("NOT_FOUND", 404);
  }) as typeof fetch;

  return { fetchImpl, decisions, attestations, quoteRequests };
}

export function ctxFor(fetchImpl: typeof fetch, agentId = "agent-test"): ToolContext {
  return {
    http: new AgentHttpClient({ baseUrl: FAKE_BASE, agentId, fetchImpl, timeoutMs: 50 }),
    agentId,
  };
}

/** A clock that advances on `sleep` rather than really waiting. */
export function runOpts(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
  let clock = FAKE_NOW.getTime();
  return {
    now: () => new Date(clock),
    sleep: async (ms: number) => {
      clock += ms;
    },
    quoteWaitMs: 30_000,
    pollIntervalMs: 5_000,
    ...overrides,
  };
}
