// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyMetaChallengeToken, verifyMetaSignature } from "./signature";

describe("Meta webhook authenticity", () => {
  it("accepts the official sha256 raw-body signature shape", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const secret = "test-meta-app-secret";
    const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, `sha256=${digest}`, secret)).toBe(true);
  });

  it("rejects a changed body, malformed header, or wrong challenge token", () => {
    const digest = createHmac("sha256", "secret").update("original").digest("hex");
    expect(verifyMetaSignature("changed", `sha256=${digest}`, "secret")).toBe(false);
    expect(verifyMetaSignature("original", digest, "secret")).toBe(false);
    expect(verifyMetaChallengeToken("wrong", "expected")).toBe(false);
    expect(verifyMetaChallengeToken("expected", "expected")).toBe(true);
  });
});
