import { randomUUID } from "node:crypto";

/**
 * HTTP client the buyer agent uses to reach Intra.
 *
 * The agent deliberately goes through the *public* surface — the same
 * `/v1` capability API and `/api` task endpoints any third-party agent would
 * use — rather than importing the repositories directly. If the agent needs a
 * capability the public API does not expose, that is a gap in the API, not a
 * reason to reach past it.
 */

export interface AgentHttpOptions {
  baseUrl: string;
  /** Agent identifier sent as `requester` — the ERC-8004 Agent ID in production. */
  agentId: string;
  /** Buyer session for task reads/writes. Derived from `agentId` by the quote API. */
  sessionId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AgentHttpResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export class AgentHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: AgentHttpOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** The session the `/v1` quote API assigns to this agent's tasks. */
  get sessionId(): string {
    return this.options.sessionId ?? `agent:${this.options.agentId.replace(/[^\w.:-]/g, "")}`;
  }

  private url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }

  async request<T>(
    method: "GET" | "POST",
    path: string,
    init: { body?: unknown; idempotent?: boolean; session?: boolean } = {},
  ): Promise<AgentHttpResult<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.idempotent) headers["idempotency-key"] = randomUUID();
    if (init.session) headers["x-session-id"] = this.sessionId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url(path), {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: T; error?: { code?: string; message?: string } }
        | null;

      if (payload?.success === true) {
        return {
          ok: true,
          status: response.status,
          data: (payload.data ?? null) as T | null,
          errorCode: null,
          errorMessage: null,
        };
      }
      return {
        ok: false,
        status: response.status,
        data: null,
        errorCode: payload?.error?.code ?? `HTTP_${response.status}`,
        errorMessage: payload?.error?.message ?? `Request failed with status ${response.status}.`,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        status: 0,
        data: null,
        errorCode: aborted ? "TOOL_TIMEOUT" : "TOOL_NETWORK_ERROR",
        errorMessage: aborted
          ? `No response within ${this.timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : "Network error.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
