// @vitest-environment node
import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import {
  buildTallyPayload,
  DEFAULT_FORM_ID,
} from "@/features/onboarding/__fixtures__/tally-payload";

import { POST as tallyWebhookRoute } from "./route";

const ctx = { params: Promise.resolve({}) };
const tallyWebhook = (request: Request) => tallyWebhookRoute(request, ctx);

/**
 * The Tally webhook HTTP boundary (M10.1, ADR-024).
 *
 * "Never trust an arbitrary request to this endpoint" (brief §3) — these
 * tests are about the wrapper around `processTallySubmission`, not the
 * pipeline's own business rules (covered in `service.integration.test.ts`).
 */

const SECRET = "test-tally-signing-secret";

let close: () => Promise<void>;

beforeEach(async () => {
  ({ close } = await createTestDatabase());
  process.env.TALLY_SIGNING_SECRET = SECRET;
  process.env.TALLY_FORM_ID = DEFAULT_FORM_ID;
});
afterEach(async () => {
  await close();
  delete process.env.TALLY_SIGNING_SECRET;
  delete process.env.TALLY_FORM_ID;
});

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/onboarding/tally", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function readJson(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("receiving a Tally webhook delivery", () => {
  it("accepts a validly signed, valid submission end to end", async () => {
    const rawBody = JSON.stringify(buildTallyPayload({ businessName: "HTTP Prints" }));
    const res = await tallyWebhook(post(rawBody, { "tally-signature": sign(rawBody) }));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).status).toBe("PROCESSED");
    expect((body.data as Record<string, unknown>).businessId).not.toBeNull();
  });

  it("rejects an invalid signature (test scenario 13) without touching the database", async () => {
    const rawBody = JSON.stringify(buildTallyPayload({ businessName: "Forged Prints" }));
    const res = await tallyWebhook(
      post(rawBody, { "tally-signature": sign(rawBody, "wrong-secret") }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect((body.error as { code: string }).code).toBe("INVALID_SIGNATURE");
  });

  it("rejects a request with no signature header at all", async () => {
    const rawBody = JSON.stringify(buildTallyPayload());
    const res = await tallyWebhook(post(rawBody));
    expect(res.status).toBe(401);
  });

  it("fails closed (503) rather than accepting an unverified payload when unconfigured", async () => {
    delete process.env.TALLY_SIGNING_SECRET;
    const rawBody = JSON.stringify(buildTallyPayload());
    const res = await tallyWebhook(post(rawBody, { "tally-signature": sign(rawBody) }));
    const { status, body } = await readJson(res);
    expect(status).toBe(503);
    expect((body.error as { code: string }).code).toBe("ONBOARDING_WEBHOOK_UNCONFIGURED");
  });

  it("rejects a body that is not valid JSON, even if signed correctly", async () => {
    const rawBody = "{not json";
    const res = await tallyWebhook(post(rawBody, { "tally-signature": sign(rawBody) }));
    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_JSON");
  });

  it("rejects a validly signed body that doesn't match the Tally webhook shape", async () => {
    const rawBody = JSON.stringify({ not: "a tally payload" });
    const res = await tallyWebhook(post(rawBody, { "tally-signature": sign(rawBody) }));
    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_WEBHOOK_PAYLOAD");
  });

  it("rejects a webhook delivery for a different form (test scenario 14)", async () => {
    const rawBody = JSON.stringify(buildTallyPayload({ formId: "some-other-form" }));
    const res = await tallyWebhook(post(rawBody, { "tally-signature": sign(rawBody) }));
    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("UNKNOWN_FORM_ID");
  });

  it("replaying the exact same signed delivery is idempotent (test scenario 17)", async () => {
    const rawBody = JSON.stringify(
      buildTallyPayload({ businessName: "Replayed HTTP Prints", submissionId: "sub-http-replay" }),
    );
    const headers = { "tally-signature": sign(rawBody) };

    const first = await readJson(await tallyWebhook(post(rawBody, headers)));
    const second = await readJson(await tallyWebhook(post(rawBody, headers)));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((first.body.data as Record<string, unknown>).status).toBe("PROCESSED");
    expect((second.body.data as Record<string, unknown>).status).toBe("REPLAYED");
    expect((second.body.data as Record<string, unknown>).businessId).toBe(
      (first.body.data as Record<string, unknown>).businessId,
    );
  });
});
