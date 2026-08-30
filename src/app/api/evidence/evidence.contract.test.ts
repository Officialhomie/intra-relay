// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on dynamic JSON API responses */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { createActiveRoute } from "@/test-support/factories";
import { createTask, submitTask } from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF } from "@/test-support/factories";

import { GET as evidence } from "./route";
import { GET as operatorMetrics } from "../operator/metrics/route";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  process.env.OPERATOR_API_KEYS = "test:op-secret-01";
  delete process.env.X402_API_KEY;
});
afterEach(async () => {
  await close();
  delete process.env.OPERATOR_API_KEYS;
});

const ctx = { params: Promise.resolve({}) };

describe("GET /api/evidence (MET-001)", () => {
  it("returns a privacy-safe JSON report with real and demo scopes", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "session-evidence-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-evidence-1");

    const res = await evidence(new Request("http://localhost/api/evidence"), ctx as any);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.real.buyers.independentSessions).toBe(1);
    expect(body.data.demo).toBeDefined();
    expect(body.data.integrations.some((i: any) => i.key === "x402")).toBe(true);
    // No raw session id anywhere in the payload.
    expect(JSON.stringify(body)).not.toContain("session-evidence-1");
  });

  it("streams a CSV export when ?format=csv", async () => {
    const res = await evidence(new Request("http://localhost/api/evidence?format=csv"), ctx as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("scope,section,metric,value");
  });
});

describe("GET /api/operator/metrics", () => {
  it("rejects a request with no operator key", async () => {
    const res = await operatorMetrics(
      new Request("http://localhost/api/operator/metrics"),
      ctx as any,
    );
    expect(res.status).toBe(401);
  });

  it("returns the report plus a content-free recent-events feed for an operator", async () => {
    const { route } = await createActiveRoute(db);
    const task = await createTask(db, "session-op-metrics-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, "session-op-metrics-1");

    const res = await operatorMetrics(
      new Request("http://localhost/api/operator/metrics", {
        headers: { "x-operator-key": "op-secret-01" },
      }),
      ctx as any,
    );
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data.recentEvents)).toBe(true);
    expect(body.data.recentEvents.some((e: any) => e.type === "task.awaiting_quote")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("session-op-metrics-1");
  });
});
