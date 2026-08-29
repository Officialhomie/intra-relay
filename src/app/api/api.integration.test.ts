// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import { businessInput, COMPLETE_FLYER_BRIEF } from "@/test-support/factories";

import { POST as createBusiness } from "./businesses/route";
import { POST as createRoute } from "./businesses/[slug]/routes/route";
import { POST as createFeedback } from "./feedback/route";
import { POST as createQuote } from "./routes/[id]/quotes/route";
import { PATCH as patchRouteStatus } from "./routes/[id]/status/route";
import { GET as getTask } from "./tasks/[id]/route";
import { POST as createTask } from "./tasks/route";
import { POST as submitTask } from "./tasks/[id]/submit/route";

let close: () => Promise<void>;
const OPERATOR_SECRET = "operator-secret-value";
const SESSION = "session-http-1234";

beforeEach(async () => {
  ({ close } = await createTestDatabase());
  process.env.OPERATOR_API_KEYS = `test-op:${OPERATOR_SECRET}`;
  delete process.env.X402_FACILITATOR_URL;
  delete process.env.X402_FACILITATOR_KEY;
});
afterEach(async () => {
  await close();
});

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("API route handlers", () => {
  it("requires an Idempotency-Key on writes", async () => {
    const res = await createBusiness(post("/api/businesses", businessInput()), params({}));
    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays the stored response for a repeated Idempotency-Key and rejects a reuse with a new body", async () => {
    const key = "idem-key-000001";
    const first = await readJson(
      await createBusiness(
        post("/api/businesses", businessInput(), { "idempotency-key": key }),
        params({}),
      ),
    );
    expect(first.status).toBe(201);

    const replay = await readJson(
      await createBusiness(
        post("/api/businesses", businessInput(), { "idempotency-key": key }),
        params({}),
      ),
    );
    expect(replay.status).toBe(201);
    expect((replay.body.data as { id: string }).id).toBe((first.body.data as { id: string }).id);

    const conflict = await readJson(
      await createBusiness(
        post("/api/businesses", businessInput({ city: "Abuja" }), { "idempotency-key": key }),
        params({}),
      ),
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body.error as { code: string }).code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("runs the full happy path over HTTP and keeps the payment UNAVAILABLE", async () => {
    const idem = (suffix: string) => ({ "idempotency-key": `idem-key-${suffix}-01` });
    const op = { "x-operator-key": OPERATOR_SECRET };
    const session = { "x-session-id": SESSION };

    const business = (
      await readJson(
        await createBusiness(post("/api/businesses", businessInput(), idem("biz")), params({})),
      )
    ).body.data as { slug: string };

    const route = (
      await readJson(
        await createRoute(
          post(`/api/businesses/${business.slug}/routes`, {}, idem("route")),
          params({ slug: business.slug }),
        ),
      )
    ).body.data as { id: string; status: string };
    expect(route.status).toBe("DRAFT");

    await patchRouteStatus(
      new Request(`http://localhost/api/routes/${route.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...idem("pv") },
        body: JSON.stringify({ status: "PENDING_VERIFICATION" }),
      }),
      params({ id: route.id }),
    );

    const nonOperatorActivate = await readJson(
      await patchRouteStatus(
        new Request(`http://localhost/api/routes/${route.id}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json", ...idem("act-noop") },
          body: JSON.stringify({ status: "ACTIVE" }),
        }),
        params({ id: route.id }),
      ),
    );
    expect(nonOperatorActivate.status).toBe(401);

    const activated = await readJson(
      await patchRouteStatus(
        new Request(`http://localhost/api/routes/${route.id}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json", ...idem("act"), ...op },
          body: JSON.stringify({ status: "ACTIVE" }),
        }),
        params({ id: route.id }),
      ),
    );
    expect(activated.status).toBe(200);
    expect((activated.body.data as { status: string }).status).toBe("ACTIVE");

    const task = (
      await readJson(
        await createTask(
          post(
            "/api/tasks",
            { structuredInput: COMPLETE_FLYER_BRIEF, route: { routeId: route.id } },
            {
              ...idem("task"),
              ...session,
            },
          ),
          params({}),
        ),
      )
    ).body.data as { id: string };

    const submitted = await readJson(
      await submitTask(
        post(`/api/tasks/${task.id}/submit`, {}, { ...idem("submit"), ...session }),
        params({ id: task.id }),
      ),
    );
    expect(submitted.status).toBe(200);
    expect((submitted.body.data as { status: string }).status).toBe("AWAITING_QUOTE");

    const quote = await readJson(
      await createQuote(
        post(
          `/api/routes/${route.id}/quotes`,
          { taskId: task.id, amountMin: 15000, turnaround: "same day" },
          {
            ...idem("quote"),
            ...op,
          },
        ),
        params({ id: route.id }),
      ),
    );
    expect(quote.status).toBe(201);

    const view = await readJson(
      await getTask(
        new Request(`http://localhost/api/tasks/${task.id}`, { headers: session }),
        params({ id: task.id }),
      ),
    );
    expect(view.status).toBe(200);
    const data = view.body.data as {
      task: { status: string };
      payments: { status: string }[];
      recommendation: { orderMessage: string } | null;
    };
    expect(data.task.status).toBe("HANDOFF_READY");
    expect(data.payments[0].status).toBe("UNAVAILABLE");
    expect(data.recommendation?.orderMessage).toMatch(/Please confirm/i);
  });

  it("rejects an operator-less quote submission", async () => {
    const res = await createQuote(
      post(
        "/api/routes/whatever/quotes",
        { taskId: "x", amountMin: 1, turnaround: "y" },
        {
          "idempotency-key": "idem-key-noop-quote",
        },
      ),
      params({ id: "whatever" }),
    );
    expect((await readJson(res)).status).toBe(401);
  });

  it("404s feedback for an unknown task", async () => {
    const res = await createFeedback(
      post(
        "/api/feedback",
        { taskId: "missing", useful: true },
        { "idempotency-key": "idem-key-fb-1" },
      ),
      params({}),
    );
    expect((await readJson(res)).status).toBe(404);
  });
});
