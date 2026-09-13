import { describe, expect, it } from "vitest";

import { site } from "@/lib/site";

import { manageLinkMessage, manageLinkPath, manageLinkUrl, whatsAppShareUrl } from "./manage-link";

/**
 * The manage link is the merchant's only credential (M10.2A), so its shape is
 * pinned here — a silent change would lock every existing merchant out.
 */

const TOKEN = "abc123def456";

describe("building the manage link", () => {
  it("keeps the established path shape", () => {
    expect(manageLinkPath("yaba-prints", TOKEN)).toBe(`/supplier/yaba-prints?t=${TOKEN}`);
  });

  it("builds an absolute link a merchant can paste anywhere", () => {
    expect(manageLinkUrl("yaba-prints", TOKEN)).toBe(`${site.url}/supplier/yaba-prints?t=${TOKEN}`);
  });
});

describe("the message a human sends", () => {
  it("carries the link and says to keep it private, in plain words", () => {
    const message = manageLinkMessage("Yaba Prints", "https://example.test/supplier/x?t=tok");
    expect(message).toContain("Yaba Prints");
    expect(message).toContain("https://example.test/supplier/x?t=tok");
    expect(message).toMatch(/keep it to yourself/i);
  });

  it("uses no technical vocabulary", () => {
    const message = manageLinkMessage("Yaba Prints", manageLinkUrl("yaba-prints", TOKEN));
    for (const jargon of ["token", "capability", "API", "endpoint", "credential", "URL"]) {
      expect(message.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });
});

describe("the WhatsApp share link", () => {
  it("strips formatting from the number and pre-fills the message", () => {
    const url = whatsAppShareUrl("+234 801 234 5678", "hello there");
    expect(url).toBe("https://wa.me/2348012345678?text=hello%20there");
  });

  it("returns null for something that is not a usable number", () => {
    expect(whatsAppShareUrl("", "hi")).toBeNull();
    expect(whatsAppShareUrl("n/a", "hi")).toBeNull();
    expect(whatsAppShareUrl("12345", "hi")).toBeNull();
  });

  it("is only ever a deep link — it cannot send anything on its own", () => {
    const url = whatsAppShareUrl("+2348012345678", "hi");
    // wa.me opens WhatsApp on the human's device. Intra has no outbound
    // messaging integration and this must never become one silently.
    expect(url?.startsWith("https://wa.me/")).toBe(true);
  });
});
