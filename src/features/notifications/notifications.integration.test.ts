// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import { reviseQuote } from "@/features/quotes/revision";
import { submitQuote } from "@/features/quotes/service";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

import { countUnread, listNotifications, markNotificationRead } from "./repository";
import { getActionCentre, getInbox } from "./service";

/**
 * Notification wiring (milestone 7 §13–§15, §17, §21). A domain event produces
 * the right notification for the right person, in plain words, and repeat
 * events about one order collapse into a single evolving item.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const BUYER = "buyer-session-notify-1";
const STRANGER = "buyer-session-stranger";

async function recommendedOrder(session = BUYER) {
  const { business, route } = await createActiveRoute(db);
  const task = await createTask(db, session, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId: route.id },
  });
  await submitTask(db, task.id, session);
  await submitQuote(db, route.id, {
    taskId: task.id,
    amountMin: 15_000,
    turnaround: "same day",
    fixed: true,
    confidence: "high",
  });
  return { business, route, taskId: task.id };
}

describe("a new request notifies the business", () => {
  it("as an action, linked into its request inbox, with no internal names", async () => {
    const { business } = await recommendedOrder();
    const inbox = await getInbox(db, "BUSINESS", business.id);
    const req = inbox.items.find((i) => i.event === "task.awaiting_quote");
    expect(req).toBeTruthy();
    expect(req!.level).toBe("ACTION_REQUIRED");
    expect(req!.deeplink).toContain(`/supplier/${business.slug}/requests`);
    expect(req!.title).toMatch(/new .*request/i);
    expect(`${req!.title} ${req!.body}`).not.toMatch(
      /awaiting_quote|task\.|sessionId|enum|RECOMMENDED/i,
    );
  });
});

describe("a quote notifies the buyer", () => {
  it("as an action to decide, linked to the order, carrying no amount", async () => {
    const { taskId } = await recommendedOrder();
    const inbox = await getInbox(db, "BUYER", BUYER);
    const quote = inbox.items.find((i) => i.event === "recommendation.created");
    expect(quote).toBeTruthy();
    expect(quote!.level).toBe("ACTION_REQUIRED");
    expect(quote!.deeplink).toBe(`/tasks/${taskId}`);
    expect(quote!.body).not.toMatch(/15,?000|NGN\s?\d/);
    expect(inbox.unread).toBeGreaterThan(0);
  });
});

describe("repeat events about one order collapse (§21)", () => {
  it("a price change updates the existing order notification and re-unreads it", async () => {
    const { route, taskId } = await recommendedOrder();
    await decideOnQuote(db, taskId, BUYER, { decision: "ACCEPT" });

    // Read everything, then the business proposes a change.
    const before = await listNotifications(db, "BUYER", BUYER);
    await markNotificationRead(db, before[0].id, "BUYER", BUYER);

    await reviseQuote(db, route.id, {
      taskId,
      amountMin: 18_000,
      turnaround: "same day",
      reason: "Card stock went up.",
    });

    const after = await listNotifications(db, "BUYER", BUYER);
    // Still exactly one buyer notification for this order, now unread again.
    expect(after).toHaveLength(1);
    expect(after[0].dedupeKey).toBe(`order:${taskId}`);
    expect(after[0].readAt).toBeNull();
    expect(after[0].title).toMatch(/new price/i);
  });
});

describe("recipients are isolated", () => {
  it("a stranger session sees nothing, and cannot mark another buyer's item read", async () => {
    await recommendedOrder();
    const strangerInbox = await getInbox(db, "BUYER", STRANGER);
    expect(strangerInbox.items).toHaveLength(0);
    expect(await countUnread(db, "BUYER", STRANGER)).toBe(0);

    const mine = await listNotifications(db, "BUYER", BUYER);
    const crossed = await markNotificationRead(db, mine[0].id, "BUYER", STRANGER);
    expect(crossed).toBeNull();
  });
});

describe("acceptance notifies both sides", () => {
  it("the buyer to send the message, the business that the customer agreed", async () => {
    const { business, taskId } = await recommendedOrder();
    await decideOnQuote(db, taskId, BUYER, { decision: "ACCEPT" });

    const buyer = await getActionCentre(db, "BUYER", BUYER);
    expect(buyer.needsAttention.some((i) => /ready to send/i.test(i.title))).toBe(true);

    const biz = await getInbox(db, "BUSINESS", business.id);
    expect(biz.items.some((i) => /accepted your quote/i.test(i.title))).toBe(true);
  });
});

describe("an agent-only order has no buyer to notify", () => {
  it("skips the buyer notification when no human session owns the task", async () => {
    const { business, route } = await createActiveRoute(db);
    const agentSession = "agent:intra-buyer-agent-abc";
    const task = await createTask(db, agentSession, {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await submitTask(db, task.id, agentSession);
    await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 15_000,
      turnaround: "same day",
      fixed: true,
    });

    // The business is still notified; there is simply no buyer inbox.
    const biz = await getInbox(db, "BUSINESS", business.id);
    expect(biz.items.length).toBeGreaterThan(0);
    const buyer = await getInbox(db, "BUYER", agentSession);
    expect(buyer.items).toHaveLength(0);
  });
});
