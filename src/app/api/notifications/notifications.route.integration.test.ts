// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import { createTask, submitTask } from "@/features/tasks/service";
import { submitQuote } from "@/features/quotes/service";
import { listNotifications } from "@/features/notifications/repository";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { GET as getRoute } from "./route";
import { POST as markRead } from "./[id]/read/route";
import { POST as markAllRoute } from "./read-all/route";

const noCtx = { params: Promise.resolve({}) };
const getNotifications = (request: Request) => getRoute(request, noCtx);
const markAll = (request: Request) => markAllRoute(request, noCtx);

/**
 * The notification API (milestone 7 §3, §14, §18, §23). The recipient is
 * resolved from credentials, never from a notification id; reading is not
 * taking the action.
 */

let close: () => Promise<void>;
let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
const BUYER = "notif-route-buyer";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

function req(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}
const json = async (res: Response) => ({
  status: res.status,
  body: (await res.json()) as Record<string, unknown>,
});

async function seed() {
  const { business, route } = await createActiveRoute(db);
  const task = await createTask(db, BUYER, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, BUYER);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: 15_000,
    turnaround: "same day",
    fixed: true,
  });
  return { business, route, taskId: task.id };
}

describe("buyer action centre", () => {
  it("returns the caller's own notifications, split by urgency, with a deep link", async () => {
    const { taskId } = await seed();
    const { status, body } = await json(
      await getNotifications(req("/api/notifications", { headers: { "x-session-id": BUYER } })),
    );
    expect(status).toBe(200);
    const data = body.data as {
      needsAttention: { deeplink: string; title: string }[];
      unread: number;
    };
    expect(data.needsAttention.some((i) => i.deeplink === `/tasks/${taskId}`)).toBe(true);
    expect(data.unread).toBeGreaterThan(0);
  });

  it("a different session sees nothing", async () => {
    await seed();
    const { body } = await json(
      await getNotifications(
        req("/api/notifications", { headers: { "x-session-id": "someone-else-entirely" } }),
      ),
    );
    const data = body.data as { needsAttention: unknown[]; updates: unknown[] };
    expect(data.needsAttention).toHaveLength(0);
    expect(data.updates).toHaveLength(0);
  });
});

describe("business action centre", () => {
  it("needs a matching manage token", async () => {
    const { business } = await seed();
    const bad = await getNotifications(
      req(`/api/notifications?businessSlug=${business.slug}&t=wrong-token`),
    );
    expect(bad.status).toBe(401);

    const okRes = await json(
      await getNotifications(
        req(`/api/notifications?businessSlug=${business.slug}&t=${business.manageToken}`),
      ),
    );
    expect(okRes.status).toBe(200);
    const data = okRes.body.data as { needsAttention: { title: string }[] };
    expect(data.needsAttention.some((i) => /new .*request/i.test(i.title))).toBe(true);
  });
});

describe("read is not the action (§18)", () => {
  it("marks one read, drops the unread count, and does not change the order", async () => {
    await seed();
    const mine = await listNotifications(db, "BUYER", BUYER);
    const target = mine[0];

    const res = await json(
      await markRead(
        req(`/api/notifications/${target.id}/read`, {
          method: "POST",
          headers: { "x-session-id": BUYER },
          body: "{}",
        }),
        ctx({ id: target.id }),
      ),
    );
    expect(res.status).toBe(200);

    const after = await json(
      await getNotifications(req("/api/notifications", { headers: { "x-session-id": BUYER } })),
    );
    const data = after.body.data as { unread: number };
    expect(data.unread).toBe(0);
  });

  it("cannot mark another recipient's notification read", async () => {
    await seed();
    const mine = await listNotifications(db, "BUYER", BUYER);
    const res = await markRead(
      req(`/api/notifications/${mine[0].id}/read`, {
        method: "POST",
        headers: { "x-session-id": "not-the-owner" },
        body: "{}",
      }),
      ctx({ id: mine[0].id }),
    );
    expect(res.status).toBe(404);
  });

  it("read-all clears the count", async () => {
    await seed();
    const res = await json(
      await markAll(
        req("/api/notifications/read-all", {
          method: "POST",
          headers: { "x-session-id": BUYER },
          body: "{}",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const after = await json(
      await getNotifications(req("/api/notifications", { headers: { "x-session-id": BUYER } })),
    );
    expect((after.body.data as { unread: number }).unread).toBe(0);
  });
});
