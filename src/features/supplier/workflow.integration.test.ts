// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- asserts on dynamic JSON API responses */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import { businessInput, COMPLETE_FLYER_BRIEF } from "@/test-support/factories";

import { POST as createBusiness } from "@/app/api/businesses/route";
import { POST as createRoute } from "@/app/api/businesses/[slug]/routes/route";
import { POST as createFeedback } from "@/app/api/feedback/route";
import { GET as operatorQueue } from "@/app/api/operator/routes/route";
import { POST as postQuote } from "@/app/api/routes/[id]/quotes/route";
import { PATCH as patchStatus } from "@/app/api/routes/[id]/status/route";
import { GET as getTask } from "@/app/api/tasks/[id]/route";
import { POST as createTask } from "@/app/api/tasks/route";
import { POST as decideTask } from "@/app/api/tasks/[id]/decision/route";
import { POST as confirmHandoffRoute } from "@/app/api/tasks/[id]/handoff-confirm/route";
import { POST as prooflineReady } from "@/app/api/tasks/[id]/proofline/ready/route";
import { POST as prooflineConfirmPickup } from "@/app/api/tasks/[id]/proofline/confirm-pickup/route";
import { POST as submitTask } from "@/app/api/tasks/[id]/submit/route";

const OPERATOR = "op-secret-1234567890";
const SESSION = "buyer-session-abcdef";
const CHECKLIST = {
  consentRecorded: true,
  contactChannelTested: true,
  publicAddressVerified: true,
  priceSourceDated: true,
  slaAgreed: true,
  sampleRequestTested: true,
};

let close: () => Promise<void>;
let n = 0;
const idem = () => ({ "idempotency-key": `idem-key-${(n += 1).toString().padStart(6, "0")}` });
const params = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });
const json = (path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

beforeEach(async () => {
  ({ close } = await createTestDatabase());
  process.env.OPERATOR_API_KEYS = `op:${OPERATOR}`;
  delete process.env.X402_FACILITATOR_URL;
  delete process.env.X402_FACILITATOR_KEY;
});
afterEach(async () => {
  await close();
});

async function onboardActiveRoute() {
  const biz = (
    await read(await createBusiness(json("/api/businesses", businessInput(), idem()), params({})))
  ).body.data as { slug: string; manageToken: string };

  const route = (
    await read(
      await createRoute(
        json(`/api/businesses/${biz.slug}/routes`, {}, idem()),
        params({ slug: biz.slug }),
      ),
    )
  ).body.data as { id: string };

  await patchStatus(
    json(
      `/api/routes/${route.id}/status`,
      { status: "PENDING_VERIFICATION" },
      { ...idem(), "x-manage-token": biz.manageToken },
      "PATCH",
    ),
    params({ id: route.id }),
  );
  const activated = await read(
    await patchStatus(
      json(
        `/api/routes/${route.id}/status`,
        { status: "ACTIVE", checklist: CHECKLIST },
        { ...idem(), "x-operator-key": OPERATOR },
        "PATCH",
      ),
      params({ id: route.id }),
    ),
  );
  expect(activated.status).toBe(200);
  return { biz, routeId: route.id };
}

async function buyerTask(routeId: string) {
  const task = (
    await read(
      await createTask(
        json(
          "/api/tasks",
          { structuredInput: COMPLETE_FLYER_BRIEF, route: { routeId } },
          { ...idem(), "x-session-id": SESSION },
        ),
        params({}),
      ),
    )
  ).body.data as { id: string };
  await submitTask(
    json(`/api/tasks/${task.id}/submit`, {}, { ...idem(), "x-session-id": SESSION }),
    params({ id: task.id }),
  );
  return task.id;
}

describe("supplier + buyer end-to-end workflow", () => {
  it("activation requires the full operator checklist", async () => {
    const biz = (
      await read(await createBusiness(json("/api/businesses", businessInput(), idem()), params({})))
    ).body.data as { slug: string; manageToken: string };
    const route = (
      await read(
        await createRoute(
          json(`/api/businesses/${biz.slug}/routes`, {}, idem()),
          params({ slug: biz.slug }),
        ),
      )
    ).body.data as { id: string };
    await patchStatus(
      json(
        `/api/routes/${route.id}/status`,
        { status: "PENDING_VERIFICATION" },
        { ...idem(), "x-manage-token": biz.manageToken },
        "PATCH",
      ),
      params({ id: route.id }),
    );

    const incomplete = await read(
      await patchStatus(
        json(
          `/api/routes/${route.id}/status`,
          { status: "ACTIVE", checklist: { ...CHECKLIST, sampleRequestTested: false } },
          { ...idem(), "x-operator-key": OPERATOR },
          "PATCH",
        ),
        params({ id: route.id }),
      ),
    );
    expect(incomplete.status).toBe(409);
    expect(incomplete.body.error.code).toBe("CHECKLIST_INCOMPLETE");
  });

  it("runs onboard → verify → request → quote → handoff → feedback", async () => {
    const { biz, routeId } = await onboardActiveRoute();
    const taskId = await buyerTask(routeId);

    const awaiting = await read(
      await getTask(
        new Request(`http://localhost/api/tasks/${taskId}`, {
          headers: { "x-session-id": SESSION },
        }),
        params({ id: taskId }),
      ),
    );
    expect(awaiting.body.data.task.status).toBe("AWAITING_QUOTE");
    expect(awaiting.body.data.payments[0].status).toBe("UNAVAILABLE");
    expect(awaiting.body.data.supplier).toBeNull(); // no contact until there is a recommendation

    const quote = await read(
      await postQuote(
        json(
          `/api/routes/${routeId}/quotes`,
          {
            taskId,
            amountMin: 15000,
            deliveryCharge: 1500,
            turnaround: "same day",
            availabilityNote: "can start after 2pm",
            fixed: true,
          },
          { ...idem(), "x-manage-token": biz.manageToken },
        ),
        params({ id: routeId }),
      ),
    );
    expect(quote.status).toBe(201);

    const recommended = await read(
      await getTask(
        new Request(`http://localhost/api/tasks/${taskId}`, {
          headers: { "x-session-id": SESSION },
        }),
        params({ id: taskId }),
      ),
    );
    // The quote is in, but the buyer has not chosen yet: no contact, no message-to-send.
    expect(recommended.body.data.task.status).toBe("RECOMMENDED");
    expect(recommended.body.data.quotes[0].deliveryCharge).toBe("1500.00");
    expect(recommended.body.data.supplier.contactChannelValue).toBeNull();
    expect(recommended.body.data.recommendation.verificationNote).toMatch(/not independently/i);

    const decided = await read(
      await decideTask(
        json(
          `/api/tasks/${taskId}/decision`,
          { decision: "ACCEPT" },
          { ...idem(), "x-session-id": SESSION },
        ),
        params({ id: taskId }),
      ),
    );
    expect(decided.status).toBe(200);
    expect(decided.body.data.task.status).toBe("HANDOFF_READY");

    const handoff = await read(
      await getTask(
        new Request(`http://localhost/api/tasks/${taskId}`, {
          headers: { "x-session-id": SESSION },
        }),
        params({ id: taskId }),
      ),
    );
    expect(handoff.body.data.task.status).toBe("HANDOFF_READY");
    expect(handoff.body.data.task.buyerDecision).toBe("ACCEPTED");
    expect(handoff.body.data.supplier.contactChannelValue).toBe("+2348012345678");
    expect(handoff.body.data.recommendation.orderMessage).toMatch(/Please confirm/i);

    const feedback = await read(
      await createFeedback(
        json("/api/feedback", { taskId, useful: true, comment: "fast" }, idem()),
        params({}),
      ),
    );
    expect(feedback.status).toBe(201);
  });

  it("runs the optional Proofline pilot after a confirmed handoff", async () => {
    const { biz, routeId } = await onboardActiveRoute();
    const taskId = await buyerTask(routeId);

    await postQuote(
      json(
        `/api/routes/${routeId}/quotes`,
        { taskId, amountMin: 15000, turnaround: "same day" },
        { ...idem(), "x-manage-token": biz.manageToken },
      ),
      params({ id: routeId }),
    );
    await decideTask(
      json(
        `/api/tasks/${taskId}/decision`,
        { decision: "ACCEPT" },
        { ...idem(), "x-session-id": SESSION },
      ),
      params({ id: taskId }),
    );

    // Proofline is gated on the buyer handoff.
    const early = await read(
      await prooflineReady(
        json(
          `/api/tasks/${taskId}/proofline/ready`,
          {},
          { ...idem(), "x-manage-token": biz.manageToken },
        ),
        params({ id: taskId }),
      ),
    );
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("HANDOFF_NOT_CONFIRMED");

    await confirmHandoffRoute(
      json(`/api/tasks/${taskId}/handoff-confirm`, {}, { ...idem(), "x-session-id": SESSION }),
      params({ id: taskId }),
    );

    // Merchant marks ready (needs the manage token).
    const noAuth = await read(
      await prooflineReady(
        json(`/api/tasks/${taskId}/proofline/ready`, {}, idem()),
        params({ id: taskId }),
      ),
    );
    expect(noAuth.status).toBe(401);

    const ready = await read(
      await prooflineReady(
        json(
          `/api/tasks/${taskId}/proofline/ready`,
          {},
          { ...idem(), "x-manage-token": biz.manageToken },
        ),
        params({ id: taskId }),
      ),
    );
    expect(ready.status).toBe(201);
    expect(ready.body.data.view.evidenceStatus).toBe("MERCHANT_MARKED_READY");
    const code = ready.body.data.pickupCode as string;

    // Buyer confirms pickup with the code.
    const confirmed = await read(
      await prooflineConfirmPickup(
        json(`/api/tasks/${taskId}/proofline/confirm-pickup`, { code }, idem()),
        params({ id: taskId }),
      ),
    );
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.view.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");

    // Buyer view exposes the evidence but never the code.
    const view = await read(
      await getTask(
        new Request(`http://localhost/api/tasks/${taskId}`, {
          headers: { "x-session-id": SESSION },
        }),
        params({ id: taskId }),
      ),
    );
    expect(view.body.data.proofline.evidenceStatus).toBe("BUYER_CONFIRMED_PICKUP");
    expect(view.body.data.proofline).not.toHaveProperty("pickupCode");
    expect(JSON.stringify(view.body.data.proofline).toLowerCase()).not.toMatch(/score|reliability/);
  });

  it("supplier can pause their own route; a new request is then rejected", async () => {
    const { biz, routeId } = await onboardActiveRoute();

    const paused = await read(
      await patchStatus(
        json(
          `/api/routes/${routeId}/status`,
          { status: "PAUSED" },
          { ...idem(), "x-manage-token": biz.manageToken },
          "PATCH",
        ),
        params({ id: routeId }),
      ),
    );
    expect(paused.status).toBe(200);
    expect(paused.body.data.status).toBe("PAUSED");

    const blocked = await read(
      await createTask(
        json(
          "/api/tasks",
          { structuredInput: COMPLETE_FLYER_BRIEF, route: { routeId } },
          { ...idem(), "x-session-id": SESSION },
        ),
        params({}),
      ),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ROUTE_UNAVAILABLE");
  });

  it("supplier can decline a request — the task fails safely with the reason", async () => {
    const { biz, routeId } = await onboardActiveRoute();
    const taskId = await buyerTask(routeId);

    const declined = await read(
      await postQuote(
        json(
          `/api/routes/${routeId}/quotes`,
          { decline: true, taskId, reason: "Outside our delivery area" },
          { ...idem(), "x-manage-token": biz.manageToken },
        ),
        params({ id: routeId }),
      ),
    );
    expect(declined.status).toBe(200);

    const view = await read(
      await getTask(
        new Request(`http://localhost/api/tasks/${taskId}`, {
          headers: { "x-session-id": SESSION },
        }),
        params({ id: taskId }),
      ),
    );
    expect(view.body.data.task.status).toBe("FAILED");
    expect(view.body.data.task.failureReason).toBe("SUPPLIER_DECLINED");
    expect(view.body.data.quotes[0].declineReason).toBe("Outside our delivery area");
  });

  it("rejects a quote with neither operator key nor manage token", async () => {
    const { routeId } = await onboardActiveRoute();
    const taskId = await buyerTask(routeId);
    const res = await read(
      await postQuote(
        json(`/api/routes/${routeId}/quotes`, { taskId, amountMin: 1, turnaround: "x" }, idem()),
        params({ id: routeId }),
      ),
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SUPPLIER_AUTH_REQUIRED");
  });

  it("operator queue needs an operator key", async () => {
    const anon = await operatorQueue(
      new Request("http://localhost/api/operator/routes"),
      params({}),
    );
    expect(anon.status).toBe(401);

    await onboardActiveRoute();
    const ok = await read(
      await operatorQueue(
        new Request("http://localhost/api/operator/routes", {
          headers: { "x-operator-key": OPERATOR },
        }),
        params({}),
      ),
    );
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data)).toBe(true);
  });
});
