import { beforeEach, describe, expect, it, vi } from "vitest";

const amp = vi.hoisted(() => {
  class Identify {
    set = vi.fn();
  }
  return {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    setUserId: vi.fn(),
    setGroup: vi.fn(),
    reset: vi.fn(),
    Identify,
  };
});

vi.mock("@amplitude/analytics-browser", () => amp);

import {
  __resetAnalyticsForTest,
  identifyUser,
  initAnalytics,
  isAnalyticsReady,
  resetIdentity,
  track,
} from "./client";
import type { BrowserAnalyticsConfig } from "./config";

const ENABLED: BrowserAnalyticsConfig = {
  enabled: true,
  apiKey: "browser-key",
  environment: "staging",
  serverZone: "US",
};
const DISABLED: BrowserAnalyticsConfig = {
  enabled: false,
  apiKey: null,
  environment: "development",
  serverZone: "US",
};

/** The SDK loads via a dynamic import — wait for `initAnalytics` to settle. */
async function initAndSettle(config: BrowserAnalyticsConfig, isTest = false) {
  initAnalytics(config, { isTest });
  await vi.waitFor(() => expect(isAnalyticsReady()).toBe(true));
}

beforeEach(() => {
  __resetAnalyticsForTest();
  vi.clearAllMocks();
});

describe("analytics client adapter (M9.5 §4, §29)", () => {
  it("stays a no-op when disabled", () => {
    initAnalytics(DISABLED, { isTest: false });
    expect(isAnalyticsReady()).toBe(false);
    expect(amp.init).not.toHaveBeenCalled();
    track("conversation_started", {});
    expect(amp.track).not.toHaveBeenCalled();
  });

  it("initialises with autocapture narrowed and never throws", async () => {
    await initAndSettle(ENABLED, true);
    expect(amp.init).toHaveBeenCalledWith(
      "browser-key",
      expect.objectContaining({
        autocapture: expect.objectContaining({
          elementInteractions: false,
          formInteractions: false,
          pageViews: false,
        }),
      }),
    );
  });

  it("stamps environment + is_test on every event and sanitises props", async () => {
    await initAndSettle(ENABLED, true);
    track("message_sent", { turn_count: 2 }, { role: "buyer", email: "leak@example.com" });
    expect(amp.track).toHaveBeenCalledWith("message_sent", {
      environment: "staging",
      is_test: true,
      role: "buyer",
      turn_count: 2,
    });
  });

  it("queues events fired before the SDK finishes loading, then flushes them", async () => {
    initAnalytics(ENABLED, { isTest: false });
    // fired while status === "loading"
    track("conversation_started", {});
    expect(amp.track).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(isAnalyticsReady()).toBe(true));
    expect(amp.track).toHaveBeenCalledWith("conversation_started", expect.any(Object));
  });

  it("swallows a thrown SDK call", async () => {
    await initAndSettle(ENABLED);
    amp.track.mockImplementationOnce(() => {
      throw new Error("amplitude exploded");
    });
    expect(() =>
      track("app_opened", {
        role: "buyer",
        platform: "web",
        pwa_installed: false,
        returning: false,
      }),
    ).not.toThrow();
  });

  it("identifyUser sets the user id, role, and (for a business) a group", async () => {
    await initAndSettle(ENABLED);
    identifyUser({ role: "business", userId: "biz-1", businessId: "biz-1" });
    expect(amp.setUserId).toHaveBeenCalledWith("biz-1");
    expect(amp.setGroup).toHaveBeenCalledWith("business", "biz-1");
  });

  it("identifyUser skips setUserId when the id is missing", async () => {
    await initAndSettle(ENABLED);
    identifyUser({ role: "buyer", userId: null });
    expect(amp.setUserId).not.toHaveBeenCalled();
  });

  it("resetIdentity calls amplitude.reset", async () => {
    await initAndSettle(ENABLED);
    resetIdentity();
    expect(amp.reset).toHaveBeenCalled();
  });
});
