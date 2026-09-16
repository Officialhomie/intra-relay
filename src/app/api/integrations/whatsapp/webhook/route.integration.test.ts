// @vitest-environment node
import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { businesses, conversationSessions, quoteRoutes } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { findBusinessBySlug } from "@/features/businesses/repository";
import { findRouteById } from "@/features/routes/repository";
import { textWebhook, statusWebhook } from "@/integrations/whatsapp/__fixtures__/webhook";

import { GET, POST } from "./route";

const ctx = { params: Promise.resolve({}) };
const APP_SECRET = "meta-app-secret-test";
let db: Database;
let close: () => Promise<void>;
let send: ReturnType<typeof vi.fn<typeof fetch>>;

function acceptedSend(id = "wamid.outbound-test") {
  return Response.json({ messaging_product: "whatsapp", messages: [{ id }] });
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-token-test");
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "access-token-test");
  vi.stubEnv("WHATSAPP_GRAPH_API_VERSION", "v99.0");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-buyer-001");
  vi.stubEnv("WHATSAPP_BUSINESS_ONBOARDING_PHONE_NUMBER_ID", "phone-business-001");
  send = vi.fn<typeof fetch>().mockImplementation(async () => acceptedSend());
  vi.stubGlobal("fetch", send);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await close();
});

function signedRequest(payload: unknown, signatureSecret = APP_SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", signatureSecret).update(body, "utf8").digest("hex");
  return new Request("http://localhost/api/integrations/whatsapp/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body,
  });
}

async function postText(input: {
  text: string;
  messageId: string;
  phoneNumberId?: string;
  sender?: string;
}) {
  return POST(signedRequest(textWebhook(input)), ctx);
}

describe("Meta callback verification", () => {
  it("returns the challenge for the configured token", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=challenge-123",
      ),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-123");
  });

  it("rejects an invalid verification token", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123",
      ),
      ctx,
    );
    expect(response.status).toBe(403);
  });
});

describe("signed webhook boundary", () => {
  it("rejects an invalid signature before processing or delivery", async () => {
    const response = await POST(signedRequest(textWebhook({}), "wrong-secret"), ctx);
    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
    expect(await db.select().from(conversationSessions)).toEqual([]);
  });

  it("rejects malformed signed envelopes and safely ignores status callbacks", async () => {
    const malformed = await POST(signedRequest({ object: "page", entry: [] }), ctx);
    expect(malformed.status).toBe(400);

    const status = await POST(signedRequest(statusWebhook()), ctx);
    expect(status.status).toBe(200);
    expect(await status.text()).toBe("EVENT_RECEIVED");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("buyer WhatsApp vertical slice", () => {
  it("uses the existing buyer conversation and delivers its plain-text response", async () => {
    const response = await postText({
      text: "I need 500 A5 flyers in Ikeja by Friday.",
      messageId: "wamid.buyer-slice-1",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
    expect(send).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "2348012345678",
      type: "text",
    });
    expect(body.text.body).toMatch(/colour|color/i);

    const [conversation] = await db.select().from(conversationSessions);
    expect(conversation).toMatchObject({
      actorRole: "buyer",
      channel: "whatsapp",
      externalConversationId: "phone-buyer-001:2348012345678",
    });
    expect(conversation.intent).toMatchObject({
      category: "printing",
      productType: "flyers",
      quantity: 500,
      size: "A5",
      location: "Ikeja",
    });
  });

  it("continues the same durable session across provider messages", async () => {
    await postText({ text: "I need 500 flyers", messageId: "wamid.session-1" });
    await postText({ text: "A5", messageId: "wamid.session-2" });

    const rows = await db.select().from(conversationSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].intent).toMatchObject({ quantity: 500, size: "A5" });
    expect(rows[0].turns).toHaveLength(4);
  });

  it("replays a provider retry without repeating processing or outbound delivery", async () => {
    const payload = textWebhook({ text: "I need flyers", messageId: "wamid.retry-1" });
    expect((await POST(signedRequest(payload), ctx)).status).toBe(200);
    expect((await POST(signedRequest(payload), ctx)).status).toBe(200);

    expect(send).toHaveBeenCalledTimes(1);
    const [conversation] = await db.select().from(conversationSessions);
    expect(conversation.turns).toHaveLength(2);
  });

  it("serializes two simultaneous deliveries of the same provider message", async () => {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<Response>((resolve) => {
      release = () => resolve(acceptedSend("wamid.concurrent-outbound"));
    });
    const started = new Promise<void>((resolve) => (entered = resolve));
    send.mockImplementationOnce(async () => {
      entered();
      return blocked;
    });

    const payload = textWebhook({ text: "I need flyers", messageId: "wamid.concurrent-webhook" });
    const first = POST(signedRequest(payload), ctx);
    await started;
    const duplicate = await POST(signedRequest(payload), ctx);
    expect(duplicate.status).toBe(200);
    release();
    expect((await first).status).toBe(200);

    expect(send).toHaveBeenCalledTimes(1);
    const [conversation] = await db.select().from(conversationSessions);
    expect(conversation.turns).toHaveLength(2);
  });
});

describe("business WhatsApp vertical slice", () => {
  const phoneNumberId = "phone-business-001";

  async function say(text: string, messageId: string) {
    return postText({ text, messageId, phoneNumberId, sender: "2348099999999" });
  }

  async function reachConsent() {
    await say(
      "My business is called WhatsApp Press. We print flyers and banners. We deliver across Lagos. Usual turnaround is 2-3 days.",
      "wamid.business-1",
    );
    await say("We quote each job.", "wamid.business-2");
    await say("My name is Tola Ade and our WhatsApp is 08099999999.", "wamid.business-3");
  }

  it("creates the same draft business and route model after explicit consent", async () => {
    await reachConsent();
    const response = await say(
      "I agree that Intra may request and display our quotes.",
      "wamid.business-consent",
    );
    expect(response.status).toBe(200);

    const business = await findBusinessBySlug(db, "whatsapp-press");
    expect(business).toMatchObject({
      status: "PENDING_VERIFICATION",
      category: "printing",
      contactName: "Tola Ade",
    });
    const [route] = await db
      .select()
      .from(quoteRoutes)
      .where(eq(quoteRoutes.businessId, business!.id));
    expect(route).toMatchObject({
      status: "DRAFT",
      deliveryAvailable: true,
      typicalTurnaround: "2-3 days",
    });
    expect(route.inputSchema.find((field) => field.key === "productType")?.options).toEqual([
      "flyers",
      "banners",
    ]);
  });

  it("retries outbound delivery without executing successful domain creation again", async () => {
    await reachConsent();
    const consent = textWebhook({
      phoneNumberId,
      sender: "2348099999999",
      messageId: "wamid.business-failed-delivery",
      text: "I agree that Intra may request and display our quotes.",
    });

    send.mockRejectedValueOnce(new Error("network unavailable"));
    const failed = await POST(signedRequest(consent), ctx);
    expect(failed.status).toBe(502);
    expect(await findBusinessBySlug(db, "whatsapp-press")).not.toBeNull();

    send.mockResolvedValueOnce(acceptedSend("wamid.retry-outbound"));
    const retried = await POST(signedRequest(consent), ctx);
    expect(retried.status).toBe(200);

    const [counts] = await db
      .select({
        businesses: sql<number>`count(distinct ${businesses.id})::int`,
        routes: sql<number>`count(distinct ${quoteRoutes.id})::int`,
      })
      .from(businesses)
      .leftJoin(quoteRoutes, eq(quoteRoutes.businessId, businesses.id));
    expect(counts).toEqual({ businesses: 1, routes: 1 });

    const business = await findBusinessBySlug(db, "whatsapp-press");
    const route = await findRouteById(
      db,
      (await db.select().from(quoteRoutes).where(eq(quoteRoutes.businessId, business!.id)))[0].id,
    );
    expect(route?.status).toBe("DRAFT");
  });
});
