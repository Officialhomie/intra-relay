import type { AgentRunView } from "@/features/agent/run/view";
import type { ConversationAction, ConversationReply } from "@/features/intent/conversation";

export const CONVERSATION_CHANNELS = ["web", "whatsapp", "telegram", "api", "mcp"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const ACTOR_ROLES = ["buyer", "business_owner", "business_operator", "agent"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** Identity already resolved/authenticated by a channel adapter. */
export interface ActorReference {
  role: ActorRole;
  externalUserId: string;
  businessId?: string;
}

/** The only inbound shape application code receives from a channel. */
export interface InboundMessage {
  actor: ActorReference;
  channel: ConversationChannel;
  externalConversationId: string;
  externalMessageId: string;
  text: string;
  receivedAt: Date;
}

export interface OutboundMessage {
  kind: "text";
  text: string;
}

export interface ConversationStateChange {
  kind: "buyer_intent_updated" | "business_onboarding_updated" | "domain_entity_created";
  fields: string[];
}

export type GatewayAction =
  | ConversationAction
  | {
      kind: "CREATE_BUSINESS_PROFILE";
      status: "COMPLETED";
      businessId: string;
      routeId: string;
    };

export interface ConversationResult {
  conversationId: string;
  actor: ActorReference;
  channel: ConversationChannel;
  messages: OutboundMessage[];
  stateChanges: ConversationStateChange[];
  actions: GatewayAction[];
  notifications: [];
  /** Present for buyer conversations; kept intact so the Web adapter can
   * preserve its established response contract. */
  reply?: ConversationReply;
  run?: AgentRunView;
  openOrderIds?: string[];
  business?: { id: string; slug: string; routeId: string; manageUrl: string };
}

export interface GatewayResult {
  result: ConversationResult;
  replayed: boolean;
}
