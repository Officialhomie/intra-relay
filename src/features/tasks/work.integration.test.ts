// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { markReadyForPickup } from "@/features/proofline/service";
import { reviseQuote } from "@/features/quotes/revision";
import { submitQuote } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { withdrawAsProvider } from "./exception-service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "./service";
import { listBuyerWork } from "./work";

/**
 * The buyer's grouped active work (milestone 7 §1, §2, §12, §20). Every task
 * lands in exactly one plain bucket, from persisted state.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const S = "buyer-work-session";

let seq = 0;
async function bind(session = S) {
  seq += 1;
  const { business, route } = await createActiveRoute(db, {
    businessName: `Print Shop ${seq}`,
    contactChannelValue: `+23480000000${seq}0`,
  });
  const task = await createTask(db, session, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, session);
  return { routeId: route.id, taskId: task.id, manageToken: business.manageToken };
}

async function quote(routeId: string, taskId: string, amount = 15_000) {
  await submitQuote(db, routeId, {
    taskId,
    amountMin: amount,
    turnaround: "same day",
    fixed: true,
  });
}

describe("grouping", () => {
  it("a request waiting on a price is WAITING and needs nothing", async () => {
    await bind();
    const { items } = await listBuyerWork(db, S);
    expect(items).toHaveLength(1);
    expect(items[0].group).toBe("WAITING");
    expect(items[0].actionRequired).toBe(false);
  });

  it("a quote awaiting the buyer's decision is ATTENTION", async () => {
    const { routeId, taskId } = await bind();
    await quote(routeId, taskId);
    const { items, attention } = await listBuyerWork(db, S);
    expect(items[0].group).toBe("ATTENTION");
    expect(items[0].actionRequired).toBe(true);
    expect(items[0].actionLabel).toBe("Review");
    expect(attention).toBe(1);
  });

  it("a proposed price change is ATTENTION with its own headline", async () => {
    const { routeId, taskId } = await bind();
    await quote(routeId, taskId);
    await decideOnQuote(db, taskId, S, { decision: "ACCEPT" });
    await reviseQuote(db, routeId, {
      taskId,
      amountMin: 18_000,
      turnaround: "same day",
      reason: "Stock went up.",
    });
    const { items } = await listBuyerWork(db, S);
    expect(items[0].group).toBe("ATTENTION");
    expect(items[0].headline).toMatch(/new price/i);
  });

  it("an accepted order not yet sent is ATTENTION; once confirmed it is IN_PROGRESS", async () => {
    const { routeId, taskId } = await bind();
    await quote(routeId, taskId);
    await decideOnQuote(db, taskId, S, { decision: "ACCEPT" });

    let work = await listBuyerWork(db, S);
    expect(work.items[0].group).toBe("ATTENTION");
    expect(work.items[0].actionLabel).toBe("Open and send");

    await confirmHandoff(db, taskId, S);
    work = await listBuyerWork(db, S);
    expect(work.items[0].group).toBe("IN_PROGRESS");
    expect(work.items[0].actionRequired).toBe(false);
  });

  it("an order the business marked ready for pickup is READY", async () => {
    const { routeId, taskId, manageToken } = await bind();
    await quote(routeId, taskId);
    await decideOnQuote(db, taskId, S, { decision: "ACCEPT" });
    await confirmHandoff(db, taskId, S);
    await markReadyForPickup(db, taskId, { manageToken });
    const { items } = await listBuyerWork(db, S);
    expect(items[0].group).toBe("READY");
    expect(items[0].actionLabel).toBe("Confirm pickup");
  });

  it("a provider withdrawal that needs the buyer is ATTENTION, not silently gone", async () => {
    const { routeId, taskId } = await bind();
    await quote(routeId, taskId);
    await withdrawAsProvider(db, routeId, { taskId, reason: "Machine down." });
    const { items } = await listBuyerWork(db, S);
    expect(items[0].group).toBe("ATTENTION");
    expect(items[0].headline).not.toMatch(/FAILED|PROVIDER_/);
  });
});

describe("multiple tasks and isolation (§12, §23)", () => {
  it("handles several requests in different states at once", async () => {
    const a = await bind();
    const b = await bind();
    await quote(b.routeId, b.taskId);
    const c = await bind();
    await quote(c.routeId, c.taskId);
    await decideOnQuote(db, c.taskId, S, { decision: "ACCEPT" });

    const { items, counts } = await listBuyerWork(db, S);
    expect(items).toHaveLength(3);
    expect(counts.WAITING).toBe(1);
    expect(counts.ATTENTION).toBe(2);
    expect(items.map((i) => i.taskId).sort()).toEqual([a.taskId, b.taskId, c.taskId].sort());
  });

  it("one session never sees another's work", async () => {
    await bind("session-one");
    const other = await listBuyerWork(db, "session-two");
    expect(other.items).toHaveLength(0);
  });
});
