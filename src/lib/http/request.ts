import type { z } from "zod";

import { HttpError } from "./response";

/** Parse and validate a JSON body against a Zod schema (NFR-SEC-002). */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(
      400,
      "INVALID_BODY",
      "Request body failed validation.",
      result.error.flatten(),
    );
  }
  return result.data;
}

/**
 * Every write requires an `Idempotency-Key` header (TECHNICAL_SPEC §6).
 * Returns the key or throws 400.
 */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new HttpError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Provide an 'Idempotency-Key' header (8-200 chars) for write requests.",
    );
  }
  return key;
}

/** Opaque buyer session id (no account, no wallet login). */
export function requireSessionId(request: Request, url: URL): string {
  const fromHeader = request.headers.get("x-session-id")?.trim();
  const fromQuery = url.searchParams.get("sessionId")?.trim();
  const sessionId = fromHeader || fromQuery;
  if (!sessionId || sessionId.length < 8) {
    throw new HttpError(400, "SESSION_REQUIRED", "Provide an 'x-session-id' header.");
  }
  return sessionId;
}
