// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/client";
import { createTestDatabase } from "@/lib/db/testing";
import { servicePayments, tasks } from "@/lib/db/schema";
import { changeRouteStatus } from "@/features/routes/service";
import { submitQuote } from "@/features/quotes/service";
import { createFeedback } from "@/features/feedback/service";
import { confirmHandoff, createTask, decideOnQuote, submitTask } from "@/features/tasks/service";
import {
  COMPLETE_FLYER_BRIEF,
  TEST_OPERATOR,
  businessInput,
  createActiveRoute,
} from "@/test-support/factories";
import { createBusiness } from "@/features/businesses/service";
import { createRoute } from "@/features/routes/service";

import { reportToCsv, reportToRows } from "./csv";
import { buildEvidenceReport } from "./report";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

const NO_ENV = {} as NodeJS.ProcessEnv;

/** Drive one buyer session through create → submit → quote → handoff-ready. */
async function runBuyerJourney(routeId: string, session: string) {
  const task = await createTask(db, session, {
    structuredInput: COMPLETE_FLYER_BRIEF,
    route: { routeId },
  });
  await submitTask(db, task.id, session);
  return task;
}

describe("buildEvidenceReport (MET-001)", () => {
  it("reports all-zero real and demo snapshots on an empty database", async () => {
    const report = await buildEvidenceReport(db, new Date(), NO_ENV);

    expect(report.real.tasks.total).toBe(0);
    expect(report.real.buyers.independentSessions).toBe(0);
    expect(report.demo.tasks.total).toBe(0);
    expect(report.real.payments.verifiedSettlements).toBe(0);
    expect(report.feedbackChangelog.length).toBeGreaterThan(0);
    expect(report.integrations.find((i) => i.key === "x402")?.state).toBe("unavailable");
    expect(report.integrations.find((i) => i.key === "eas-attestation")?.state).toBe("unavailable");
  });

  it("marks EAS attestation available only with production network + a signer", async () => {
    const report = await buildEvidenceReport(db, new Date(), {
      ...NO_ENV,
      NETWORK_ENV: "production",
      ATTESTATION_SIGNER_KEY: `0x${"1".repeat(64)}`,
    });
    expect(report.integrations.find((i) => i.key === "eas-attestation")?.state).toBe("available");
  });

  it("counts genuine buyer sessions, returning buyers, and quote latency", async () => {
    const { route } = await createActiveRoute(db);

    // Two one-off sessions + one returning session (tasks two days apart).
    await runBuyerJourney(route.id, "session-oneoff-1");
    await runBuyerJourney(route.id, "session-oneoff-2");
    const returner = await runBuyerJourney(route.id, "session-returning-1");
    const secondVisit = await createTask(db, "session-returning-1", {
      structuredInput: COMPLETE_FLYER_BRIEF,
      route: { routeId: route.id },
    });
    await db
      .update(tasks)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(tasks.id, secondVisit.id));

    // A genuine supplier quote → latency sample + a completed quote request.
    await submitQuote(db, route.id, {
      taskId: returner.id,
      amountMin: 15000,
      turnaround: "Same day",
    });

    const report = await buildEvidenceReport(db, new Date(), NO_ENV);

    expect(report.real.buyers.independentSessions).toBe(3);
    expect(report.real.buyers.returningSessions).toBe(1);
    expect(report.real.buyers.sessionsWithMultipleTasks).toBe(1);
    expect(report.real.tasks.submitted).toBe(3);
    expect(report.real.tasks.quoteRequestsCompleted).toBe(1);
    expect(report.real.quoteResponses.priced).toBe(1);
    expect(report.real.quoteResponses.latency.count).toBe(1);
    expect(report.real.quoteResponses.latency.medianMinutes).not.toBeNull();
    expect(report.demo.tasks.total).toBe(0);
  });

  it("keeps [DEMO SEED] activity out of the real scope", async () => {
    const demoBusiness = await createBusiness(
      db,
      businessInput({ businessName: "[DEMO SEED] Demo Printer" }),
    );
    const demoDraft = await createRoute(db, demoBusiness.slug, {});
    await changeRouteStatus(db, demoDraft.id, "PENDING_VERIFICATION", {
      operator: null,
      canManage: true,
    });
    const demoRoute = await changeRouteStatus(
      db,
      demoDraft.id,
      "ACTIVE",
      { operator: TEST_OPERATOR },
      {
        consentRecorded: true,
        contactChannelTested: true,
        publicAddressVerified: true,
        priceSourceDated: true,
        slaAgreed: true,
        sampleRequestTested: true,
      },
    );
    await runBuyerJourney(demoRoute.id, "session-demo-1");

    const report = await buildEvidenceReport(db, new Date(), NO_ENV);

    expect(report.demo.businesses.active).toBe(1);
    expect(report.demo.tasks.total).toBe(1);
    expect(report.real.businesses.total).toBe(0);
    expect(report.real.tasks.total).toBe(0);
  });

  it("counts a Celo settlement only when the row has a verified tx hash", async () => {
    const { route } = await createActiveRoute(db);
    const task = await runBuyerJourney(route.id, "session-pay-1");

    await db.insert(servicePayments).values({
      taskId: task.id,
      routeId: route.id,
      service: "quote",
      resource: "/v1/x/y/quote",
      maxFeeUsd: "0.0500",
      status: "SETTLED",
      txHash: "0x" + "a".repeat(64),
    });
    await db.insert(servicePayments).values({
      taskId: task.id,
      routeId: route.id,
      service: "quote",
      resource: "/v1/x/y/quote",
      maxFeeUsd: "0.0500",
      status: "FAILED",
      errorCode: "VERIFICATION_FAILED",
    });

    const report = await buildEvidenceReport(db, new Date(), NO_ENV);
    expect(report.real.payments.verifiedSettlements).toBe(1);
    expect(report.real.payments.failedAttempts).toBe(1);
  });

  it("counts route pause events and buyer-confirmed handoffs", async () => {
    const { route } = await createActiveRoute(db);
    const task = await runBuyerJourney(route.id, "session-h-1");
    await submitQuote(db, route.id, {
      taskId: task.id,
      amountMin: 12000,
      turnaround: "Next day",
    });
    await decideOnQuote(db, task.id, "session-h-1", { decision: "ACCEPT" });
    await confirmHandoff(db, task.id, "session-h-1");
    await changeRouteStatus(db, route.id, "PAUSED", { operator: TEST_OPERATOR });

    const report = await buildEvidenceReport(db, new Date(), NO_ENV);
    expect(report.real.tasks.handoffConfirmed).toBe(1);
    expect(report.real.freshnessEvents.routePauses).toBe(1);
    expect(report.real.routes.paused).toBe(1);
  });

  it("records buyer feedback split by usefulness and comment", async () => {
    const { route } = await createActiveRoute(db);
    const a = await runBuyerJourney(route.id, "session-f-1");
    const b = await runBuyerJourney(route.id, "session-f-2");
    await createFeedback(db, { taskId: a.id, useful: true, comment: "Fast and clear" });
    await createFeedback(db, { taskId: b.id, useful: false });

    const report = await buildEvidenceReport(db, new Date(), NO_ENV);
    expect(report.real.feedback.total).toBe(2);
    expect(report.real.feedback.useful).toBe(1);
    expect(report.real.feedback.notUseful).toBe(1);
    expect(report.real.feedback.withComment).toBe(1);
  });

  it("marks x402 available when a facilitator key is configured", async () => {
    const report = await buildEvidenceReport(db, new Date(), {
      ...NO_ENV,
      X402_API_KEY: "test-key",
      X402_NETWORK: "eip155:11142220",
    });
    expect(report.integrations.find((i) => i.key === "x402")?.state).toBe("available");
  });

  it("flattens to CSV rows with a scope,section,metric,value shape", async () => {
    const report = await buildEvidenceReport(db, new Date(), NO_ENV);
    const rows = reportToRows(report);
    expect(rows.some((r) => r.scope === "real" && r.metric === "independent_sessions")).toBe(true);
    expect(rows.some((r) => r.scope === "demo")).toBe(true);

    const csv = reportToCsv(report);
    expect(csv.split("\n")[0]).toBe("scope,section,metric,value");
    expect(csv).toContain("real,buyers,independent_sessions,0");
  });
});
