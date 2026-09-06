// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import { __resetConversations } from "@/features/intent/memory";

import { POST } from "./route";

const ctx = { params: Promise.resolve({}) };
const conversation = (request: Request) => POST(request, ctx);

/**
 * The conversation endpoint (milestone 7 §6–§9). A multi-turn brief reaches the
 * run intact; "start a new request" forgets the conversation without touching
 * anything persisted.
 */

let close: () => Promise<void>;
const SESSION = "session-conv-http-1";

beforeEach(async () => {
  ({ close } = await createTestDatabase());
  __resetConversations();
});
afterEach(async () => {
  await close();
  __resetConversations();
});

function turn(message: string, session = SESSION) {
  return new Request("http://localhost/api/conversation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": session },
    body: JSON.stringify({ message }),
  });
}

async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("multi-turn brief reaches the run", () => {
  it("accumulates across turns and starts a run with the whole brief, not just the last line", async () => {
    await conversation(turn("I need 500 A5 full colour flyers"));
    await conversation(turn("by Friday"));
    const res = await json(await conversation(turn("deliver to Yaba")));

    expect(res.status).toBe(202);
    const data = res.body.data as Record<string, unknown>;
    expect((data.action as { kind: string }).kind).toBe("START_RUN");
    const brief = (data.action as { brief: Record<string, unknown> }).brief;
    expect(brief).toMatchObject({
      quantity: 500,
      size: "A5",
      colour: "full colour",
      deliveryArea: "Yaba",
    });
    expect(brief.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.run).toBeTruthy();
  });
});

describe("start a new request", () => {
  it("forgets the conversation; a later turn carries nothing over", async () => {
    await conversation(turn("I need 1000 flyers by Monday in Surulere"));

    const reset = await json(
      await conversation(
        new Request("http://localhost/api/conversation", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": SESSION },
          body: JSON.stringify({ reset: true }),
        }),
      ),
    );
    expect(reset.status).toBe(200);
    expect((reset.body.data as { reset: boolean }).reset).toBe(true);

    const next = await json(await conversation(turn("hello")));
    const data = next.body.data as Record<string, unknown>;
    expect(data.understood).toEqual({});
    expect((data.action as { kind: string }).kind).toBe("NONE");
  });

  it("rejects an empty turn", async () => {
    const res = await json(await conversation(turn("")));
    expect(res.status).toBe(400);
  });
});
