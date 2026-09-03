// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { findTaskById } from "@/features/tasks/repository";
import { decideOnQuote, getTaskView } from "@/features/tasks/service";
import { requestQuoteViaCapabilityApi } from "@/features/routes/quote-request";
import { updateRoute } from "@/features/routes/repository";
import { submitQuote } from "@/features/quotes/service";
import { decideOnPriceChange, reviseQuote } from "@/features/quotes/revision";
import { COMPLETE_FLYER_BRIEF, createActiveRoute } from "@/test-support/factories";

/**
 * The agent-task ownership gap (milestone 6 §17).
 *
 * When the buyer agent asks a provider for a quote it does so through the
 * public `/v1` capability API, which assigns the resulting task an *agent*
 * session. Milestone 5 surfaced the consequence: the human who started the run
 * could not then decide on their own order (price change, cancellation,
 * approval) because their browser session did not match.
 *
 * The fix: the run carries the human's browser session to the quote API as a
 * buyer claim, stamped onto the task at creation and immutable afterwards.
 * Either session — the agent's, or the claimed human's — may act on the task.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const HUMAN = "browser-session-victor";
const AGENT_REQUESTER = "intra-demo-buyer-abc123";
const STRANGER = "browser-session-someone-else";

const CTX = { xPaymentHeader: null, resourceUrl: "http://localhost/v1/x/y/quote" };

async function agentCreatedOrder(buyerClaim: string | undefined) {
  const { business, route } = await createActiveRoute(db);
  // A free route keeps this test on the plain AWAITING_QUOTE path (no x402).
  await updateRoute(db, route.id, { queryFeeUsd: "0.0000" });
  const outcome = await requestQuoteViaCapabilityApi(
    db,
    business.slug,
    route.slug,
    { requester: AGENT_REQUESTER, buyerClaim, input: { ...COMPLETE_FLYER_BRIEF } },
    CTX,
  );
  if (outcome.kind !== "AWAITING_QUOTE") throw new Error(`unexpected outcome ${outcome.kind}`);
  const taskId = outcome.body.taskId;
  await submitQuote(db, route.id, {
    taskId,
    amountMin: 15_000,
    turnaround: "same day",
    fixed: true,
    confidence: "high",
  });
  return { route, taskId };
}

const REVISION = {
  amountMin: 19_500,
  turnaround: "next day",
  fixed: true,
  reason: "Card stock went up this morning.",
};

describe("a task an agent created for a known human", () => {
  it("stores the human's session as the buyer claim, not as the task session", async () => {
    const { taskId } = await agentCreatedOrder(HUMAN);
    const task = await findTaskById(db, taskId);
    expect(task?.sessionId).toBe(`agent:${AGENT_REQUESTER}`);
    expect(task?.buyerClaimSession).toBe(HUMAN);
  });

  it("lets the human read their own agent-created order", async () => {
    const { taskId } = await agentCreatedOrder(HUMAN);
    const view = await getTaskView(db, taskId, HUMAN);
    expect(view.task.id).toBe(taskId);
  });

  it("lets the human accept the recommended quote", async () => {
    const { taskId } = await agentCreatedOrder(HUMAN);
    const result = await decideOnQuote(db, taskId, HUMAN, { decision: "ACCEPT" });
    expect(result.decision).toBe("ACCEPTED");
    expect(result.task.status).toBe("HANDOFF_READY");
  });

  it("lets the human cancel (decline) their own order", async () => {
    const { taskId } = await agentCreatedOrder(HUMAN);
    const result = await decideOnQuote(db, taskId, HUMAN, {
      decision: "DECLINE",
      reason: "Changed my mind.",
    });
    expect(result.decision).toBe("DECLINED");
    expect(result.task.status).toBe("CANCELLED");
  });

  it("lets the human decide on a price change the business proposes afterwards", async () => {
    const { route, taskId } = await agentCreatedOrder(HUMAN);
    await decideOnQuote(db, taskId, HUMAN, { decision: "ACCEPT" });
    await reviseQuote(db, route.id, { taskId, ...REVISION });

    const declined = await decideOnPriceChange(db, taskId, HUMAN, { decision: "DECLINE" });
    expect(declined.decision).toBe("DECLINED");
    expect(declined.inForce.amountMin).toBe("15000.00");
  });
});

describe("the claim cannot be used to reach someone else's order", () => {
  it("refuses a stranger's session on every buyer decision", async () => {
    const { route, taskId } = await agentCreatedOrder(HUMAN);

    await expect(getTaskView(db, taskId, STRANGER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideOnQuote(db, taskId, STRANGER, { decision: "ACCEPT" })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );

    await decideOnQuote(db, taskId, HUMAN, { decision: "ACCEPT" });
    await reviseQuote(db, route.id, { taskId, ...REVISION });
    await expect(
      decideOnPriceChange(db, taskId, STRANGER, { decision: "ACCEPT" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ignores a buyer claim that just echoes the agent session", async () => {
    const { taskId } = await agentCreatedOrder(`agent:${AGENT_REQUESTER}`);
    const task = await findTaskById(db, taskId);
    expect(task?.buyerClaimSession).toBeNull();
  });

  it("still works with no buyer claim — the agent session owns the task", async () => {
    const { taskId } = await agentCreatedOrder(undefined);
    const task = await findTaskById(db, taskId);
    expect(task?.buyerClaimSession).toBeNull();
    const result = await decideOnQuote(db, taskId, `agent:${AGENT_REQUESTER}`, {
      decision: "ACCEPT",
    });
    expect(result.decision).toBe("ACCEPTED");
  });
});
