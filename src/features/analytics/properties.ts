/**
 * Property redaction (M9.5, brief §26, §42; ADR-021).
 *
 * The purpose of analytics here is BEHAVIOURAL MEASUREMENT, not a second copy of
 * private data. Everything that leaves this process — client or server — passes
 * through `sanitizeProps` first, which:
 *
 *   - allows only primitive values (string | number | boolean | null);
 *   - drops any key that looks like content or a secret;
 *   - truncates long strings (a last-ditch guard against free text);
 *   - warns in development, and NEVER throws.
 *
 * Raw conversation text, contact details, addresses, names, tokens, handover
 * secrets/salt, wallet keys and tx hashes must never appear in an event.
 */

export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsPrimitive | undefined>;

/** Normalised (lowercased, alphanumeric-only) keys that must never be sent. */
export const REDACTION_DENYLIST: readonly string[] = [
  // free text / content
  "message",
  "messages",
  "comment",
  "comments",
  "text",
  "body",
  "content",
  "prompt",
  "reply",
  "note",
  "notes",
  "description",
  "reason", // may hold a free-text decline reason — send `reasongiven` boolean instead
  // direct identifiers / contact
  "email",
  "phone",
  "tel",
  "telephone",
  "whatsapp",
  "mobile",
  "msisdn",
  "address",
  "street",
  "name",
  "businessname",
  "contactname",
  "fullname",
  "firstname",
  "lastname",
  "contact",
  "contactchannelvalue",
  "recipient",
  "sender",
  "buyer",
  // auth / session
  "token",
  "managetoken",
  "sessionid",
  "session",
  "idempotencykey",
  "cookie",
  "authorization",
  "auth",
  "bearer",
  // secrets
  "code",
  "handovercode",
  "otp",
  "pin",
  "salt",
  "preimage",
  "nonce",
  "secret",
  "apikey",
  "key",
  "privatekey",
  "mnemonic",
  "seedphrase",
  "password",
  // chain / wallet
  "signature",
  "sig",
  "txhash",
  "transactionhash",
  "hash",
  "wallet",
  "walletaddress",
  "payoutaddress",
  "attestationuid",
];

/** Fragments that force a drop wherever they appear inside a key. */
const SECRET_FRAGMENTS: readonly string[] = [
  "secret",
  "password",
  "privatekey",
  "apikey",
  "mnemonic",
  "seedphrase",
  "authorization",
  "bearer",
  "managetoken",
];

const MAX_STRING_LENGTH = 200;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function warnDropped(key: string): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[analytics] dropped disallowed property: ${key}`);
  }
}

/** Is this key safe to send? */
export function isAllowedKey(key: string): boolean {
  const norm = normaliseKey(key);
  if (!norm) return false;
  if (REDACTION_DENYLIST.includes(norm)) return false;
  return !SECRET_FRAGMENTS.some((fragment) => norm.includes(fragment));
}

/**
 * Return a new object containing only the safe, primitive properties. Never
 * mutates the input, never throws.
 */
export function sanitizeProps(props?: AnalyticsProps | null): Record<string, AnalyticsPrimitive> {
  const out: Record<string, AnalyticsPrimitive> = {};
  if (!props) return out;

  for (const [rawKey, value] of Object.entries(props)) {
    if (value === undefined) continue;
    const key = rawKey.trim();

    if (!isAllowedKey(key)) {
      warnDropped(key);
      continue;
    }

    if (value === null || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        warnDropped(key);
        continue;
      }
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
      continue;
    }

    // objects, arrays, functions, symbols, bigint — never sent
    warnDropped(key);
  }

  return out;
}
