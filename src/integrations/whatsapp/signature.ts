import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Meta signs the exact raw request body as lowercase HMAC-SHA256 hex in
 * `X-Hub-Signature-256: sha256=<digest>`. */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const received = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(received.toLowerCase(), expected);
}

export function verifyMetaChallengeToken(presented: string | null, expected: string): boolean {
  return !!presented && !!expected && safeEqual(presented, expected);
}
