// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { prooflineEvents } from "@/lib/db/schema";
import { submitQuote } from "@/features/quotes/service";
import {
  confirmHandoff,
  createTask,
  decideOnQuote,
  getTaskView,
  submitTask,
} from "@/features/tasks/service";
import { COMPLETE_FLYER_BRIEF, businessInput, createActiveRoute } from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";
import { createRoute } from "@/features/routes/service";

import { confirmPickup, getProoflineView, markReadyForPickup } from "./service";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const SESSION = "buyer-session-abcd1234";

/** Drive a task all the way to a confirmed WhatsApp handoff. */
async function handedOffTask() {
  const { business, route } = await createActiveRoute(db);
  const task = await createTask(db, SESSION, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, SESSION);
  await submitQuote(db, route.id, { taskId: task.id, amountMin: 15000, turnaround: "same day" });
  await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
  await confirmHandoff(db, task.id, SESSION);
  return { task, route, manageToken: business.manageToken };
}

describe("Proofline pilot — fulfilment evidence (ADR-016)", () => {
  it("records the two events with every required field and an advancing evidence status", async () => {
    const { task, manageToken } = await handedOffTask();

    const ready = await markReadyForPickup(db, task.id, { manageToken });
    expect(ready.pickupCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(ready.view.evidenceStatus).toBe("MERCHANT_MARKED_READY");
    expect(ready.view.disclaimer.toLowerCase()).toContain("not a cryptographic proof");
    expect(ready.view.disclaimer.toLowerCase()).toContain("not a payment receipt or settlement");

    const confirm = await confirmPickup(db, task.id, { sessionId: SESSION });
    expect(confirm.method).toBe("buyer_session");
    expect(confirm.view.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");

    const rows = await db.select().from(prooflineEvents);
    expect(rows).toHaveLength(2);
    const readyRow = rows.find((r) => r.eventType === "READY_FOR_PICKUP")!;
    const pickupRow = rows.find((r) => r.eventType === "PICKUP_CONFIRMED")!;

    // task/order reference, actor role, timestamp, event type, confirmation method, evidence status
    expect(readyRow.taskId).toBe(task.id);
    expect(readyRow.actorRole).toBe("merchant");
    expect(readyRow.createdAt).toBeInstanceOf(Date);
    expect(readyRow.confirmationMethod).toBe("merchant_manage_token");
    expect(readyRow.evidenceStatus).toBe("MERCHANT_MARKED_READY");

    expect(pickupRow.actorRole).toBe("buyer");
    expect(pickupRow.confirmationMethod).toBe("buyer_session");
    expect(pickupRow.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");
    expect(pickupRow.pickupCode).toBeNull();

    // no reliability score anywhere in the view
    const json = JSON.stringify(confirm.view).toLowerCase();
    expect(json).not.toMatch(/score|reliability|rating|on[-_ ]?time rate/);

    // the buyer-facing view never carries the merchant's code
    const buyerView = await getProoflineView(db, task.id, { includePickupCode: false });
    expect(buyerView).not.toHaveProperty("pickupCode");
    // audit trail
    const view = await getTaskView(db, task.id, SESSION);
    expect(view.timeline.map((e) => e.type)).toEqual(
      expect.arrayContaining(["proofline.ready_for_pickup", "proofline.pickup_confirmed"]),
    );
  });

  it("lets the buyer confirm with the one-time code from any session", async () => {
    const { task, manageToken } = await handedOffTask();
    const { pickupCode } = await markReadyForPickup(db, task.id, { manageToken });

    const confirm = await confirmPickup(db, task.id, {
      sessionId: "a-completely-different-session",
      code: pickupCode.toLowerCase(), // case-insensitive
    });
    expect(confirm.method).toBe("one_time_code");
    expect(confirm.view.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");
  });

  describe("authorization", () => {
    it("rejects mark-ready without a manage token", async () => {
      const { task } = await handedOffTask();
      await expect(markReadyForPickup(db, task.id, { manageToken: null })).rejects.toMatchObject({
        code: "PROOFLINE_MERCHANT_AUTH_REQUIRED",
        status: 401,
      });
      expect(await db.select().from(prooflineEvents)).toHaveLength(0);
    });

    it("rejects mark-ready with another business's manage token", async () => {
      const { task } = await handedOffTask();
      const other = await createBusiness(db, businessInput({ businessName: "Other Printer" }));
      await createRoute(db, other.slug, {});
      await expect(
        markReadyForPickup(db, task.id, { manageToken: other.manageToken }),
      ).rejects.toMatchObject({ code: "PROOFLINE_MERCHANT_AUTH_REQUIRED", status: 401 });
    });

    it("rejects a pickup confirmation with neither a matching session nor a valid code", async () => {
      const { task, manageToken } = await handedOffTask();
      await markReadyForPickup(db, task.id, { manageToken });
      await expect(
        confirmPickup(db, task.id, { sessionId: "wrong-session", code: "ZZZZZZ" }),
      ).rejects.toMatchObject({ code: "PICKUP_CONFIRM_REJECTED", status: 401 });
      expect(await db.select().from(prooflineEvents)).toHaveLength(1);
    });

    it("still confirms via session even if a wrong code is also supplied", async () => {
      const { task, manageToken } = await handedOffTask();
      await markReadyForPickup(db, task.id, { manageToken });
      const confirm = await confirmPickup(db, task.id, { sessionId: SESSION, code: "NOPE12" });
      expect(confirm.method).toBe("buyer_session");
    });
  });

  describe("gating — no event before the buyer handoff", () => {
    it("blocks mark-ready until the handoff is confirmed", async () => {
      const { business, route } = await createActiveRoute(db);
      const task = await createTask(db, SESSION, {
        structuredInput: COMPLETE_FLYER_BRIEF,
        route: { routeId: route.id },
      });
      await submitTask(db, task.id, SESSION);
      await submitQuote(db, route.id, { taskId: task.id, amountMin: 15000, turnaround: "1 day" });
      await decideOnQuote(db, task.id, SESSION, { decision: "ACCEPT" });
      // HANDOFF_READY but the buyer has NOT confirmed they sent the message
      await expect(
        markReadyForPickup(db, task.id, { manageToken: business.manageToken }),
      ).rejects.toMatchObject({ code: "HANDOFF_NOT_CONFIRMED", status: 409 });
    });

    it("blocks pickup confirmation before the merchant marks ready", async () => {
      const { task } = await handedOffTask();
      await expect(confirmPickup(db, task.id, { sessionId: SESSION })).rejects.toMatchObject({
        code: "NOT_READY_FOR_PICKUP",
        status: 409,
      });
    });
  });

  describe("replay / invalid transitions", () => {
    it("rejects a second mark-ready", async () => {
      const { task, manageToken } = await handedOffTask();
      await markReadyForPickup(db, task.id, { manageToken });
      await expect(markReadyForPickup(db, task.id, { manageToken })).rejects.toMatchObject({
        code: "ALREADY_MARKED_READY",
        status: 409,
      });
    });

    it("rejects a second pickup confirmation (replay)", async () => {
      const { task, manageToken } = await handedOffTask();
      await markReadyForPickup(db, task.id, { manageToken });
      await confirmPickup(db, task.id, { sessionId: SESSION });
      await expect(confirmPickup(db, task.id, { sessionId: SESSION })).rejects.toMatchObject({
        code: "PICKUP_ALREADY_CONFIRMED",
        status: 409,
      });
      await expect(
        confirmPickup(db, task.id, { sessionId: null, code: "anything" }),
      ).rejects.toMatchObject({ code: "PICKUP_ALREADY_CONFIRMED", status: 409 });
    });
  });

  describe("missing order", () => {
    it("404s an unknown task for both events", async () => {
      await expect(
        markReadyForPickup(db, "no-such-task", { manageToken: "x".repeat(32) }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
      await expect(confirmPickup(db, "no-such-task", { sessionId: SESSION })).rejects.toMatchObject(
        { code: "TASK_NOT_FOUND", status: 404 },
      );
    });
  });

  it("does not claim pickup happened until the buyer confirms", async () => {
    const { task, manageToken } = await handedOffTask();
    await markReadyForPickup(db, task.id, { manageToken });
    const view = await getProoflineView(db, task.id, { includePickupCode: false });
    expect(view.pickupConfirmedAt).toBeNull();
    expect(view.evidenceStatus).toBe("MERCHANT_MARKED_READY");
    expect(view.events.some((e) => e.type === "PICKUP_CONFIRMED")).toBe(false);
  });
});
