// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import type { NotificationRow } from "@/lib/db/schema";

import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";
import { createTask, submitTask } from "@/features/tasks/service";
import { submitQuote } from "@/features/quotes/service";

import { setPreferences } from "./preferences";
import { deliverPush } from "./push";
import { listPushSubscriptions, savePushSubscription, upsertNotification } from "./repository";

/**
 * Web push delivery (milestone 7 phase C §15, §17, §18, §35). Push is an
 * attention mechanism, never a workflow dependency — every failure is swallowed
 * and the in-app notification row always stands.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sendNotification.mockReset().mockResolvedValue(undefined);
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_SUBJECT = "mailto:test@localhost";
});
afterEach(async () => {
  await close();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

const KEY = "buyer-push-1";

async function notification(
  overrides: Partial<Parameters<typeof upsertNotification>[1]> = {},
): Promise<NotificationRow> {
  return upsertNotification(db, {
    audience: "BUYER",
    recipientKey: KEY,
    event: "recommendation.created",
    level: "ACTION_REQUIRED",
    title: "A quote is ready",
    body: "Open the order to decide.",
    deeplink: "/tasks/abc",
    entityType: "task",
    entityId: "abc",
    dedupeKey: "order:abc",
    ...overrides,
  });
}

async function subscribe(endpoint = "https://push.example/ep-1") {
  await savePushSubscription(db, {
    audience: "BUYER",
    recipientKey: KEY,
    endpoint,
    p256dh: "p",
    auth: "a",
  });
}

describe("delivery gating", () => {
  it("does nothing when push is not configured", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });
    const sent = await deliverPush(db, await notification());
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing when the recipient has push turned off", async () => {
    await subscribe();
    const sent = await deliverPush(db, await notification());
    expect(sent).toBe(0);
  });

  it("sends an action-required notification once push is on", async () => {
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });
    const sent = await deliverPush(db, await notification());
    expect(sent).toBe(1);
    const [, payload] = sendNotification.mock.calls[0];
    const parsed = JSON.parse(payload as string);
    expect(parsed).toMatchObject({
      title: "A quote is ready",
      url: "/tasks/abc",
      tag: "order:abc",
    });
    // No id, amount, address or secret in the payload (§11, §18).
    expect(payload).not.toMatch(/abc-|amount|address|secret|token/i);
  });

  it("repeat events about one order push with a stable tag, so the OS collapses them (§34)", async () => {
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });

    await deliverPush(db, await notification({ title: "A quote is ready" }));
    await deliverPush(db, await notification({ title: "The business proposed a new price" }));
    await deliverPush(db, await notification({ title: "The business proposed a new price" }));

    const tags = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string).tag);
    expect(new Set(tags)).toEqual(new Set(["order:abc"]));
  });

  it("holds back informational notifications unless the person opted in", async () => {
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });
    const info = await notification({
      event: "proofline.pickup_confirmed",
      level: "COMPLETED",
      dedupeKey: "order:done",
      title: "Order complete",
    });
    expect(await deliverPush(db, info)).toBe(0);

    await setPreferences(db, "BUYER", KEY, { pushInformational: true });
    expect(await deliverPush(db, info)).toBe(1);
  });
});

describe("wired into the domain (§18)", () => {
  it("a recorded quote triggers a push to the subscribed buyer, and the workflow still succeeds", async () => {
    const BUYER = "buyer-e2e-push";
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, BUYER, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, BUYER);

    await savePushSubscription(db, {
      audience: "BUYER",
      recipientKey: BUYER,
      endpoint: "https://push.example/e2e",
      p256dh: "p",
      auth: "a",
    });
    await setPreferences(db, "BUYER", BUYER, { pushEnabled: true });
    sendNotification.mockClear();

    // The quote must succeed regardless of push.
    const result = await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });
    expect(result.task.status).toBe("RECOMMENDED");

    // notify() fires push fire-and-forget; give the microtask queue a beat.
    await new Promise((r) => setTimeout(r, 20));
    expect(sendNotification).toHaveBeenCalled();
  });
});

describe("failure handling (§17, §35)", () => {
  it("deletes a subscription the push service reports as gone (410)", async () => {
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

    await deliverPush(db, await notification());
    expect(await listPushSubscriptions(db, "BUYER", KEY)).toHaveLength(0);
  });

  it("drops a subscription after repeated soft failures, and never throws", async () => {
    await subscribe();
    await setPreferences(db, "BUYER", KEY, { pushEnabled: true });
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));

    for (let i = 0; i < 3; i += 1) {
      await expect(deliverPush(db, await notification())).resolves.toBe(0);
    }
    // After three consecutive soft failures the dead endpoint is pruned (§35).
    expect(await listPushSubscriptions(db, "BUYER", KEY)).toHaveLength(0);
  });
});
