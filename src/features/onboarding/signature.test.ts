import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyTallySignature } from "./signature";

/**
 * Tally webhook signature verification (M10.1 test scenario 13).
 *
 * Never trust an unsigned or mis-signed request to the onboarding webhook.
 */

const SECRET = "test-signing-secret";
const BODY = JSON.stringify({ eventId: "evt-1", eventType: "FORM_RESPONSE" });

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifying a Tally webhook signature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyTallySignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a body that was tampered with after signing", () => {
    const signature = sign(BODY, SECRET);
    const tampered = BODY.replace("evt-1", "evt-2");
    expect(verifyTallySignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyTallySignature(BODY, sign(BODY, "a-different-secret"), SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyTallySignature(BODY, null, SECRET)).toBe(false);
  });

  it("rejects a signature header that isn't valid base64-decodable data", () => {
    // Buffer.from tolerates most strings, so this specifically exercises the
    // length-mismatch path rather than the try/catch.
    expect(verifyTallySignature(BODY, "not-the-right-length", SECRET)).toBe(false);
  });
});
