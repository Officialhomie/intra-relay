import { afterEach, describe, expect, it } from "vitest";

import { ctxFor, fakeIntra } from "../testing/fake-intra";
import { toAgentRunView } from "./view";
import {
  __clearAgentRunFetch,
  approveAgentRun,
  getAgentRunForSession,
  startAgentRun,
} from "./service";
import { __clearRuns, getRun } from "./store";

void ctxFor; // keep the shared testing module import tree identical

const SESSION = "browser-session-aaaaaaaa";
const REQUEST =
  "I need 500 A5 full colour flyers printed before Friday, delivered to UNILAG main gate";

afterEach(() => {
  __clearRuns();
  __clearAgentRunFetch();
});

async function waitForRun(runId: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const run = getRun(runId);
    if (run && run.status !== "RUNNING") return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run never left RUNNING");
}

function startFake(
  printers: Parameters<typeof fakeIntra>[0],
  overrides: Record<string, unknown> = {},
) {
  const fake = fakeIntra(printers);
  const run = startAgentRun({
    request: REQUEST,
    buyerSessionId: SESSION,
    origin: "https://intra.test",
    mode: "deterministic",
    fetchImpl: fake.fetchImpl,
    options: { quoteWaitMs: 200, pollIntervalMs: 20, ...overrides },
  });
  return { run, fake };
}

describe("agent run store + service (the /api/agent surface)", () => {
  it("runs to AWAITING_APPROVAL and exposes a recommendation, nothing persisted", async () => {
    const { run } = startFake([
      { slug: "tolu", name: "Tolu Prints", quote: { amountMin: 46_000 } },
      { slug: "yaba", name: "Yaba Copy", quote: { amountMin: 45_000, turnaround: "48 hours" } },
    ]);
    await waitForRun(run.runId);

    const view = toAgentRunView(getRun(run.runId)!);
    expect(view.status).toBe("AWAITING_APPROVAL");
    expect(view.notPersisted).toBe(true);
    expect(view.recommendation).not.toBeNull();
    expect(view.requestedQuotes).toHaveLength(2);
    // The internal agent session must never leak into the view.
    expect(JSON.stringify(view)).not.toContain("agent:intra-buyer-agent");
  });

  it("only the browser session that started a run can read it", async () => {
    const { run } = startFake([{ slug: "tolu", name: "Tolu", quote: {} }]);
    await waitForRun(run.runId);

    expect(getAgentRunForSession(run.runId, "someone-else-session").forbidden).toBe(true);
    expect(getAgentRunForSession(run.runId, SESSION).run?.status).toBe("AWAITING_APPROVAL");
  });

  it("ACCEPT records the decision and attests the commitment (mock)", async () => {
    const { run, fake } = startFake([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    await waitForRun(run.runId);
    const card = toAgentRunView(getRun(run.runId)!).recommendation!;

    const out = await approveAgentRun({
      runId: run.runId,
      buyerSessionId: SESSION,
      decision: "ACCEPT",
      offerFingerprint: card.offerFingerprint,
    });

    expect(out.ok).toBe(true);
    expect(out.ok && out.run.status).toBe("APPROVED");
    expect(fake.decisions.map((d) => d.decision)).toEqual(["ACCEPT"]);
    expect(fake.attestations).toEqual(["task_tolu"]);
    expect(out.ok && toAgentRunView(out.run).commitment?.simulated).toBe(true);
  });

  it("DECLINE records a decline and never attests", async () => {
    const { run, fake } = startFake([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    await waitForRun(run.runId);
    const card = toAgentRunView(getRun(run.runId)!).recommendation!;

    const out = await approveAgentRun({
      runId: run.runId,
      buyerSessionId: SESSION,
      decision: "DECLINE",
      reason: "too slow",
      offerFingerprint: card.offerFingerprint,
    });

    expect(out.ok && out.run.status).toBe("DECLINED");
    expect(fake.decisions[0].decision).toBe("DECLINE");
    expect(fake.attestations).toHaveLength(0);
  });

  it("refuses a stale offer fingerprint (no decision recorded)", async () => {
    const { run, fake } = startFake([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    await waitForRun(run.runId);

    const out = await approveAgentRun({
      runId: run.runId,
      buyerSessionId: SESSION,
      decision: "ACCEPT",
      offerFingerprint: "not-the-offer-shown",
    });

    // The run stays open; approval.ts rejected the stale fingerprint.
    expect(out.ok).toBe(true);
    expect(out.ok && out.run.status).toBe("AWAITING_APPROVAL");
    expect(fake.decisions).toHaveLength(0);
  });

  it("a wrong-session approve is refused 403", async () => {
    const { run } = startFake([{ slug: "tolu", name: "Tolu Prints", quote: {} }]);
    await waitForRun(run.runId);
    const card = toAgentRunView(getRun(run.runId)!).recommendation!;

    const out = await approveAgentRun({
      runId: run.runId,
      buyerSessionId: "intruder",
      decision: "ACCEPT",
      offerFingerprint: card.offerFingerprint,
    });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(403);
  });
});
