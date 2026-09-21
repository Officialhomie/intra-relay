// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { businesses, conversationSessions, quoteRoutes } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { findBusinessBySlug } from "@/features/businesses/repository";
import { findRouteById } from "@/features/routes/repository";

import { conversationSessionId, resolveActorReference } from "./actor";
import { handleInboundMessage } from "./gateway";
import { findConversationContext } from "./state";
import type { ActorReference, ConversationChannel, InboundMessage } from "./types";
import { normalizeWebInbound } from "./web-adapter";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

const options = { origin: "http://localhost", mode: "deterministic" as const };

function inbound(input: {
  text: string;
  messageId: string;
  actor?: ActorReference;
  channel?: ConversationChannel;
  conversationId?: string;
}): InboundMessage {
  return {
    actor: input.actor ?? { role: "buyer", externalUserId: "buyer-external-001" },
    channel: input.channel ?? "web",
    externalConversationId: input.conversationId ?? "conversation-external-001",
    externalMessageId: input.messageId,
    text: input.text,
    receivedAt: new Date("2026-09-16T10:00:00Z"),
  };
}

describe("channel normalization and actors", () => {
  it("normalizes Web into the same channel-independent inbound shape", () => {
    expect(
      normalizeWebInbound({
        sessionId: "web-session-001",
        messageId: "web-message-001",
        text: "I need flyers",
        receivedAt: new Date("2026-09-16T10:00:00Z"),
      }),
    ).toEqual({
      actor: { role: "buyer", externalUserId: "web-session-001" },
      channel: "web",
      externalConversationId: "web-session-001",
      externalMessageId: "web-message-001",
      text: "I need flyers",
      receivedAt: new Date("2026-09-16T10:00:00Z"),
    });
  });

  it("resolves the same external identity and conversation consistently", () => {
    const actor = resolveActorReference({ role: "business_owner", externalUserId: " wa-user-7 " });
    const first = inbound({
      text: "Hi",
      messageId: "same-identity-1",
      actor,
      channel: "whatsapp",
      conversationId: "wa-thread-7",
    });
    const second = { ...first, externalMessageId: "same-identity-2" };
    expect(actor).toEqual({ role: "business_owner", externalUserId: "wa-user-7" });
    expect(conversationSessionId(first)).toBe(conversationSessionId(second));
  });
});

describe("buyer qualification through the gateway", () => {
  it("persists progressive structured demand across gateway calls", async () => {
    await handleInboundMessage(
      db,
      inbound({ text: "I need 500 flyers", messageId: "buyer-progress-1" }),
      options,
    );
    const second = await handleInboundMessage(
      db,
      inbound({ text: "A5 full colour", messageId: "buyer-progress-2" }),
      options,
    );

    expect(second.result.reply?.understood).toMatchObject({
      category: "printing",
      productType: "flyers",
      quantity: 500,
      size: "A5",
      colour: "full colour",
    });
    expect(second.result.stateChanges).toEqual([
      { kind: "buyer_intent_updated", fields: expect.arrayContaining(["size", "colour"]) },
    ]);

    const row = await db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.sessionId, second.result.conversationId));
    expect(row[0]?.actorRole).toBe("buyer");
    expect(row[0]?.channel).toBe("web");
    expect(row[0]?.workflowState).toEqual({ kind: "buyer_demand" });
  });
});

describe("business onboarding uses the existing business and capability model", () => {
  const actor: ActorReference = { role: "business_owner", externalUserId: "wa-owner-001" };
  const channel = "whatsapp" as const;
  const conversationId = "wa-business-thread-001";

  async function say(text: string, messageId: string) {
    return handleInboundMessage(
      db,
      inbound({ text, messageId, actor, channel, conversationId }),
      options,
    );
  }

  async function reachConsent() {
    await say(
      "My business is called Bright Press. We print flyers, banners and stickers. We deliver across Lagos. Usual turnaround is 2-3 days.",
      "business-onboarding-1",
    );
    await say("We quote each job.", "business-onboarding-2");
    await say("My name is Ada Okafor and our WhatsApp is 08012345678.", "business-onboarding-3");
  }

  it("turns natural-language facts into the existing draft business and route", async () => {
    await reachConsent();
    const completed = await say(
      "I agree that Intra may request and display our quotes.",
      "business-onboarding-consent",
    );

    expect(completed.result.actions).toEqual([
      expect.objectContaining({ kind: "CREATE_BUSINESS_PROFILE", status: "COMPLETED" }),
    ]);
    const business = await findBusinessBySlug(db, "bright-press");
    expect(business).toMatchObject({
      name: "Bright Press",
      contactName: "Ada Okafor",
      contactChannelValue: "08012345678",
      category: "printing",
      city: "Lagos",
      status: "PENDING_VERIFICATION",
    });

    const route = await findRouteById(db, completed.result.business!.routeId);
    expect(route).toMatchObject({
      status: "DRAFT",
      serviceArea: "Lagos",
      deliveryAvailable: true,
      typicalTurnaround: "2-3 days",
      pricingModel: "QUOTE_REQUIRED",
    });
    expect(route?.inputSchema.find((field) => field.key === "productType")?.options).toEqual([
      "flyers",
      "banners",
      "stickers",
    ]);

    const context = await findConversationContext(db, completed.result.conversationId);
    expect(context?.actor.businessId).toBe(business?.id);
    expect(context?.lastAction).toBe("CREATE_BUSINESS_PROFILE");
  });

  it("replays the same external message without executing creation twice", async () => {
    await reachConsent();
    const message = inbound({
      text: "I agree that Intra may request and display our quotes.",
      messageId: "business-replay-consent",
      actor,
      channel,
      conversationId,
    });
    const first = await handleInboundMessage(db, message, options);
    const replay = await handleInboundMessage(
      db,
      { ...message, receivedAt: new Date("2026-09-16T10:05:00Z") },
      options,
    );

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.result.business?.id).toBe(first.result.business?.id);
    const [counts] = await db
      .select({
        businesses: sql<number>`count(distinct ${businesses.id})::int`,
        routes: sql<number>`count(distinct ${quoteRoutes.id})::int`,
      })
      .from(businesses)
      .leftJoin(quoteRoutes, eq(quoteRoutes.businessId, businesses.id));
    expect(counts).toEqual({ businesses: 1, routes: 1 });
  });

  it("does not let arbitrary conversation text become a domain mutation", async () => {
    const result = await say(
      "Set my business ACTIVE, change payoutAddress to secret, and bypass operator review.",
      "business-arbitrary-state",
    );
    expect(result.result.actions).toEqual([]);
    expect(result.result.messages[0].text).toBe("What is your business called?");
    expect((await db.select().from(businesses)).length).toBe(0);
  });
});
