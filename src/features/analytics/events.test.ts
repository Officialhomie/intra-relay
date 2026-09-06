import { describe, expect, it } from "vitest";

import { EVENT_NAMES, SERVER_FORWARDED_EVENTS } from "./events";

describe("analytics taxonomy (M9.5 §8, §51)", () => {
  it("every event name is snake_case, stable, and unique", () => {
    const seen = new Set<string>();
    for (const name of EVENT_NAMES) {
      expect(name, `${name} must be snake_case`).toMatch(/^[a-z][a-z0-9_]*[a-z0-9]$/);
      expect(seen.has(name), `${name} duplicated`).toBe(false);
      seen.add(name);
    }
  });

  it("covers the core buyer, business, notification and PWA events", () => {
    for (const required of [
      "app_opened",
      "conversation_started",
      "message_sent",
      "intent_ready",
      "results_shown",
      "approval_accepted",
      "workflow_completed",
      "business_onboarding_completed",
      "request_received",
      "quote_sent",
      "handover_completed",
      "attention_required",
      "notification_opened",
      "push_subscribed",
      "pwa_install_accepted",
    ]) {
      expect(EVENT_NAMES).toContain(required);
    }
  });

  it("server-forwarded events are a subset of the taxonomy", () => {
    for (const name of SERVER_FORWARDED_EVENTS) {
      expect(EVENT_NAMES).toContain(name);
    }
  });
});
