import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tally webhook signature verification (M10.1).
 *
 * Verified against Tally's own docs (`tally.so/help/webhooks`): the
 * `Tally-Signature` header is a base64-encoded HMAC-SHA256 of the **raw**
 * request body, using the workspace's signing secret. This MUST run against
 * the raw bytes exactly as received — never against a re-serialized/parsed
 * object, which can differ in key order or whitespace and silently break a
 * legitimate signature (or, worse, make an attacker's forged body look valid
 * if the comparison is lenient). A constant-time comparison prevents timing
 * side-channels.
 */
export function verifyTallySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  let received: Buffer;
  let expectedBuf: Buffer;
  try {
    received = Buffer.from(signatureHeader, "base64");
    expectedBuf = Buffer.from(expected, "base64");
  } catch {
    return false;
  }
  if (received.length !== expectedBuf.length) return false;
  return timingSafeEqual(received, expectedBuf);
}
