// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on dynamic JSON API responses */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { submitQuote } from "@/features/quotes/service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { POST as markReady } from "./ready/route";
import { POST as confirmPickup } from "./confirm-pickup/route";

let db: Database;
let close: () => Promise<void>;
let n = 0;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "buyer-session-http-01";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });
const idem = () => `pl-key-${(n += 1).toString().padStart(6, "0")}`;

function req(path: string, body: unknown, headers: Record<string, string> = {}, key?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key ?? idem(), ...headers },
    body: JSON.stringify(body),
  });
}

async function handedOff() {
  const { business, route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, { taskId: task.id, amountMin: 15000, turnaround: "same day" });
  await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
  await confirmHandoff(db, task.id, SESSION);
  return { taskId: task.id, manageToken: business.manageToken };
}

describe("POST /api/tasks/:id/proofline/*", () => {
  it("requires an Idempotency-Key", async () => {
    const bad = new Request("http://localhost/api/tasks/x/proofline/ready", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await read(await markReady(bad, params("x")));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("404s an unknown order", async () => {
    const res = await read(
      await markReady(
        req("/api/tasks/ghost/proofline/ready", {}, { "x-manage-token": "y".repeat(32) }),
        params("ghost"),
      ),
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TASK_NOT_FOUND");
  });

  it("rejects mark-ready without the manage token", async () => {
    const { taskId } = await handedOff();
    const res = await read(
      await markReady(req(`/api/tasks/${taskId}/proofline/ready`, {}), params(taskId)),
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PROOFLINE_MERCHANT_AUTH_REQUIRED");
  });

  it("runs the full pilot over HTTP and is idempotent on retry", async () => {
    const { taskId, manageToken } = await handedOff();

    const key = "pl-ready-fixed-01";
    const first = await read(
      await markReady(
        req(`/api/tasks/${taskId}/proofline/ready`, {}, { "x-manage-token": manageToken }, key),
        params(taskId),
      ),
    );
    expect(first.status).toBe(201);
    expect(first.body.data.view.evidenceStatus).toBe("MERCHANT_MARKED_READY");
    const code: string = first.body.data.pickupCode;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    // same key replays the same code, no second event
    const replay = await read(
      await markReady(
        req(`/api/tasks/${taskId}/proofline/ready`, {}, { "x-manage-token": manageToken }, key),
        params(taskId),
      ),
    );
    expect(replay.body.data.pickupCode).toBe(code);

    // buyer confirms with the code, no session
    const confirmed = await read(
      await confirmPickup(
        req(`/api/tasks/${taskId}/proofline/confirm-pickup`, { code }),
        params(taskId),
      ),
    );
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.method).toBe("one_time_code");
    expect(confirmed.body.data.view.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");
    expect(JSON.stringify(confirmed.body).toLowerCase()).not.toMatch(/score|reliability/);
  });

  it("rejects an invalid pickup code", async () => {
    const { taskId, manageToken } = await handedOff();
    await markReady(
      req(`/api/tasks/${taskId}/proofline/ready`, {}, { "x-manage-token": manageToken }),
      params(taskId),
    );
    const res = await read(
      await confirmPickup(
        req(`/api/tasks/${taskId}/proofline/confirm-pickup`, { code: "WRONG1" }),
        params(taskId),
      ),
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PICKUP_CONFIRM_REJECTED");
  });

  it("confirms via the buyer session header", async () => {
    const { taskId, manageToken } = await handedOff();
    await markReady(
      req(`/api/tasks/${taskId}/proofline/ready`, {}, { "x-manage-token": manageToken }),
      params(taskId),
    );
    const res = await read(
      await confirmPickup(
        req(`/api/tasks/${taskId}/proofline/confirm-pickup`, {}, { "x-session-id": SESSION }),
        params(taskId),
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.method).toBe("buyer_session");
  });
});
