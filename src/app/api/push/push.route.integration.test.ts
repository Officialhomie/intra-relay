// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import { listPushSubscriptions } from "@/features/notifications/repository";
import { getPreferences } from "@/features/notifications/preferences";
import { businessInput } from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";

import { POST as subscribeRoute } from "./subscribe/route";
import { POST as unsubscribeRoute } from "./unsubscribe/route";
import { GET as configRoute } from "./config/route";

/**
 * Push subscription lifecycle + authorisation (milestone 7 phase C §8, §9,
 * §22, §24). A subscription is bound to the recipient the SERVER resolves from
 * credentials — a client-sent identity is never trusted, and one person can
 * never touch another's device.
 */

let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const ctx = { params: Promise.resolve({}) };
const subscribe = (r: Request) => subscribeRoute(r, ctx);
const unsubscribe = (r: Request) => unsubscribeRoute(r, ctx);
const config = (r: Request) => configRoute(r, ctx);

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const json = async (res: Response) => ({
  status: res.status,
  body: (await res.json()) as Record<string, unknown>,
});

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
  userAgent: "Test/1.0",
});

describe("subscribe binds to the authenticated recipient", () => {
  it("uses the session id from the header, not anything in the body", async () => {
    const res = await json(
      await subscribe(
        post(
          "/api/push/subscribe",
          { ...sub("https://push.example/a"), userId: "somebody-else-session" },
          { "x-session-id": "the-real-buyer-session" },
        ),
      ),
    );
    expect(res.status).toBe(200);

    expect(await listPushSubscriptions(db, "BUYER", "the-real-buyer-session")).toHaveLength(1);
    expect(await listPushSubscriptions(db, "BUYER", "somebody-else-session")).toHaveLength(0);
    // Subscribing opts the person into push.
    expect((await getPreferences(db, "BUYER", "the-real-buyer-session")).pushEnabled).toBe(true);
  });

  it("a business subscribes only with a matching manage token", async () => {
    const business = await createBusiness(db, businessInput());

    const bad = await subscribe(
      post(
        `/api/push/subscribe?businessSlug=${business.slug}&t=nope`,
        sub("https://push.example/b"),
      ),
    );
    expect(bad.status).toBe(401);

    const okRes = await subscribe(
      post(
        `/api/push/subscribe?businessSlug=${business.slug}&t=${business.manageToken}`,
        sub("https://push.example/b"),
      ),
    );
    expect(okRes.status).toBe(200);
    expect(await listPushSubscriptions(db, "BUSINESS", business.id)).toHaveLength(1);
    // Not leaked into the BUYER namespace under the slug.
    expect(await listPushSubscriptions(db, "BUYER", business.slug)).toHaveLength(0);
  });
});

describe("unsubscribe is scoped (§24)", () => {
  it("one buyer cannot remove another buyer's device", async () => {
    await subscribe(
      post("/api/push/subscribe", sub("https://push.example/mine"), {
        "x-session-id": "owner-x-session",
      }),
    );

    const res = await json(
      await unsubscribe(
        post(
          "/api/push/unsubscribe",
          { endpoint: "https://push.example/mine" },
          { "x-session-id": "attacker-y-session" },
        ),
      ),
    );
    expect(res.status).toBe(200); // idempotent success shape
    // ...but the real owner's subscription is untouched.
    expect(await listPushSubscriptions(db, "BUYER", "owner-x-session")).toHaveLength(1);
  });

  it("the owner can remove their own, and the last one turns push off", async () => {
    await subscribe(
      post("/api/push/subscribe", sub("https://push.example/last"), {
        "x-session-id": "solo-session",
      }),
    );
    await unsubscribe(
      post(
        "/api/push/unsubscribe",
        { endpoint: "https://push.example/last" },
        { "x-session-id": "solo-session" },
      ),
    );
    expect(await listPushSubscriptions(db, "BUYER", "solo-session")).toHaveLength(0);
    expect((await getPreferences(db, "BUYER", "solo-session")).pushEnabled).toBe(false);
  });
});

describe("config endpoint", () => {
  it("reports whether push is configured without needing auth", async () => {
    const res = await json(await config(new Request("http://localhost/api/push/config")));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("configured");
    expect(res.body.data).toHaveProperty("vapidPublicKey");
  });
});
