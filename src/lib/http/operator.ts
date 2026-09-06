import { timingSafeEqual } from "node:crypto";

import { HttpError } from "./response";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Operator authentication.
 *
 * An operator presents `x-operator-key` matching one of the comma-separated
 * entries in `OPERATOR_API_KEYS` (`label:secret` pairs). With no configured
 * keys, no request can act as an operator. Secrets live only in the server
 * environment (TECHNICAL_SPEC §6).
 */
export interface Operator {
  label: string;
}

export function getOperator(request: Request): Operator | null {
  const presented = request.headers.get("x-operator-key")?.trim();
  if (!presented) return null;

  const configured = (process.env.OPERATOR_API_KEYS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of configured) {
    const separator = entry.indexOf(":");
    if (separator === -1) continue;
    const label = entry.slice(0, separator);
    const secret = entry.slice(separator + 1);
    if (secret.length > 0 && constantTimeEqual(secret, presented)) return { label };
  }
  return null;
}

/** Supplier capability token (ADR-008). Not a wallet secret. */
export function getManageToken(request: Request): string | null {
  const value = request.headers.get("x-manage-token")?.trim();
  return value && value.length >= 8 ? value : null;
}

export function requireOperator(request: Request): Operator {
  const operator = getOperator(request);
  if (!operator) {
    throw new HttpError(
      401,
      "OPERATOR_REQUIRED",
      "This action requires a valid operator key ('x-operator-key').",
    );
  }
  return operator;
}
