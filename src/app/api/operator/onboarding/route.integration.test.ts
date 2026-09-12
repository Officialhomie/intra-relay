// @vitest-environment node
import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import {
  buildTallyPayload,
  DEFAULT_FORM_ID,
} from "@/features/onboarding/__fixtures__/tally-payload";

import { POST as tallyWebhookRoute } from "../../onboarding/tally/route";
import { GET as listOnboardingRoute } from "./route";

const ctx = { params: Promise.resolve({}) };
const tallyWebhook = (request: Request) => tallyWebhookRoute(request, ctx);
const listOnboarding = (request: Request) => listOnboardingRoute(request, ctx);

/**
 * Operator view of Tally onboarding submissions (M10.1 §11).
 *
 * `NEEDS_REVIEW` submissions create no business, so this is the only place
 * an operator can see what needs fixing without reopening Tally.
 */

const SECRET = "test-tally-signing-secret";
const OPERATOR_SECRET = "operator-secret-value";

let close: () => Promise<void>;

beforeEach(async () => {
  ({ close } = await createTestDatabase());
  process.env.TALLY_SIGNING_SECRET = SECRET;
  process.env.TALLY_FORM_ID = DEFAULT_FORM_ID;
  process.env.OPERATOR_API_KEYS = `test-op:${OPERATOR_SECRET}`;
});
afterEach(async () => {
  await close();
  delete process.env.TALLY_SIGNING_SECRET;
  delete process.env.TALLY_FORM_ID;
  delete process.env.OPERATOR_API_KEYS;
});

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
}

async function deliver(overrides: Parameters<typeof buildTallyPayload>[0]) {
  const rawBody = JSON.stringify(buildTallyPayload(overrides));
  await tallyWebhook(
    new Request("http://localhost/api/onboarding/tally", {
      method: "POST",
      headers: { "content-type": "application/json", "tally-signature": sign(rawBody) },
      body: rawBody,
    }),
  );
}

function get(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/operator/onboarding", { headers });
}

describe("the operator onboarding list", () => {
  it("requires an operator key", async () => {
    const res = await listOnboarding(get());
    expect(res.status).toBe(401);
  });

  it("lists a NEEDS_REVIEW submission with its issues, with no business created", async () => {
    await deliver({ businessName: null, submissionId: "sub-op-1" });

    const res = await listOnboarding(get({ "x-operator-key": OPERATOR_SECRET }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { submissions: Array<Record<string, unknown>> } };
    const row = body.data.submissions.find((s) => s.tallySubmissionId === "sub-op-1");
    expect(row).toBeDefined();
    expect(row!.status).toBe("NEEDS_REVIEW");
    expect(row!.businessId).toBeNull();
    expect((row!.issues as unknown[]).length).toBeGreaterThan(0);
  });

  it("lists a PROCESSED submission with its business and route ids", async () => {
    await deliver({ businessName: "Operator Visible Prints", submissionId: "sub-op-2" });

    const res = await listOnboarding(get({ "x-operator-key": OPERATOR_SECRET }));
    const body = (await res.json()) as { data: { submissions: Array<Record<string, unknown>> } };
    const row = body.data.submissions.find((s) => s.tallySubmissionId === "sub-op-2");
    expect(row).toBeDefined();
    expect(row!.status).toBe("PROCESSED");
    expect(row!.businessId).not.toBeNull();
    expect(row!.routeId).not.toBeNull();
  });
});
