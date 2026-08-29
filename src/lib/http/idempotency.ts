import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";

import { HttpError } from "./response";

export interface IdempotentResult {
  status: number;
  body: unknown;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

/**
 * Run a write exactly once per (scope, Idempotency-Key) (TECHNICAL_SPEC §6).
 *
 * A repeat with the same key + same body replays the stored response. A repeat
 * with the same key but a different body is rejected (409). Only successful
 * (2xx) responses are recorded.
 */
export async function runIdempotent(
  db: Database,
  scope: string,
  key: string,
  requestPayload: unknown,
  run: () => Promise<IdempotentResult>,
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
    return Response.json(existing.responseBody, { status: existing.responseStatus });
  }

  const result = await run();

  if (result.status >= 200 && result.status < 300) {
    const inserted = await db
      .insert(idempotencyKeys)
      .values({
        scope,
        key,
        requestHash,
        responseStatus: result.status,
        responseBody: result.body,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      // Lost a race; replay the stored response.
      const [stored] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
        .limit(1);
      if (stored) return Response.json(stored.responseBody, { status: stored.responseStatus });
    }
  }

  return Response.json(result.body, { status: result.status });
}
