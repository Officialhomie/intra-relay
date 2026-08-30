import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";

import { HttpError } from "./response";

export interface IdempotentResult {
  status: number;
  body: unknown;
  /** Extra response headers to persist and replay (e.g. `X-PAYMENT-RESPONSE`). */
  headers?: Record<string, string>;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

function respond(body: unknown, status: number, headers?: Record<string, string> | null): Response {
  const response = Response.json(body, { status });
  for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
  return response;
}

/**
 * Run a write exactly once per (scope, Idempotency-Key) (TECHNICAL_SPEC §6).
 *
 * A repeat with the same key + same body replays the stored response (status,
 * body, and any recorded headers). A repeat with the same key but a different
 * body is rejected (409). Only successful (2xx) responses are recorded, unless
 * `cacheErrors` is set — used where a failing response still has a durable side
 * effect (e.g. a created Task with a PAYMENT_SERVICE_UNAVAILABLE result) that
 * must replay identically.
 */
export async function runIdempotent(
  db: Database,
  scope: string,
  key: string,
  requestPayload: unknown,
  run: () => Promise<IdempotentResult>,
  options: { cacheErrors?: boolean } = {},
): Promise<Response> {
  const requestHash = hashPayload(requestPayload);

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "This Idempotency-Key was already used with a different request body.",
      );
    }
    return respond(existing.responseBody, existing.responseStatus, existing.responseHeaders);
  }

  const result = await run();

  if ((result.status >= 200 && result.status < 300) || options.cacheErrors) {
    const inserted = await db
      .insert(idempotencyKeys)
      .values({
        scope,
        key,
        requestHash,
        responseStatus: result.status,
        responseBody: result.body,
        responseHeaders: result.headers ?? null,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      const [stored] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
        .limit(1);
      if (stored)
        return respond(stored.responseBody, stored.responseStatus, stored.responseHeaders);
    }
  }

  return respond(result.body, result.status, result.headers);
}
