export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  sessionId?: string;
  operatorKey?: string;
  manageToken?: string;
  /** Reuse a key to make a retry idempotent; a fresh one is generated otherwise. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function newIdempotencyKey(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random()}-${Date.now()}`;
  return `web-${rand}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60);
}

/** Typed fetch for the Intra API. Throws {@link ApiError} on a non-2xx body. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };

  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = options.idempotencyKey ?? newIdempotencyKey();
  if (options.sessionId) headers["x-session-id"] = options.sessionId;
  if (options.operatorKey) headers["x-operator-key"] = options.operatorKey;
  if (options.manageToken) headers["x-manage-token"] = options.manageToken;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server. Check your connection.");
  }

  const payload = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string; details?: unknown } }
    | null;

  if (!response.ok || !payload || payload.success === false) {
    const error = payload && payload.success === false ? payload.error : null;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "The request failed.",
      error?.details,
    );
  }

  return payload.data;
}
