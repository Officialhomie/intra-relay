import type { Database } from "@/lib/db/client";
import { startAgentRun } from "@/features/agent/run/service";
import { toAgentRunView } from "@/features/agent/run/view";
import { recordPilotEvent } from "@/features/analytics/pilot";
import { handleConversationTurn } from "@/features/intent/conversation";
import { summariseIntent } from "@/features/intent/reply";
import { listSessionTasksInStates } from "@/features/tasks/repository";

import { conversationSessionId, resolveActorReference } from "./actor";
import { handleBusinessOnboardingTurn } from "./business-onboarding";
import { processInboundOnce } from "./idempotency";
import { recordConversationEvent } from "./observability";
import { bindConversationContext, updateConversationWorkflow } from "./state";
import type { ConversationResult, GatewayResult, InboundMessage } from "./types";

const OPEN_TRANSACTION_STATES = ["RECOMMENDED"] as const;

export interface ConversationGatewayOptions {
  /** Needed only when a complete buyer brief starts the existing HTTP-based
   * agent run. A channel adapter supplies its deployment origin. */
  origin: string;
  mode?: "assisted" | "deterministic";
}

async function buyerTurn(
  db: Database,
  message: InboundMessage,
  conversationId: string,
  firstTurn: boolean,
  options: ConversationGatewayOptions,
): Promise<ConversationResult> {
  const openTasks = await listSessionTasksInStates(db, conversationId, OPEN_TRANSACTION_STATES);
  const reply = await handleConversationTurn(db, {
    sessionId: conversationId,
    message: message.text,
    hasOpenTransaction: openTasks.length > 0,
  });

  if (firstTurn) {
    void recordPilotEvent(db, { name: "conversation_started", actorKey: conversationId });
  }

  await recordConversationEvent(db, {
    name: "intent_extracted",
    conversationId,
    actor: message.actor,
    channel: message.channel,
    data: {
      intent: reply.intent,
      category: reply.understood.category ?? null,
      changedFields: reply.changed,
    },
  });
  if (reply.changed.length > 0) {
    await recordConversationEvent(db, {
      name: "state_changed",
      conversationId,
      actor: message.actor,
      channel: message.channel,
      data: { fields: reply.changed },
    });
  }

  await updateConversationWorkflow(db, conversationId, {
    workflowState: { kind: "buyer_demand" },
    pendingQuestion: reply.action.kind === "NEEDS_INFO" ? reply.message : null,
    lastAction: reply.action.kind,
    summary: summariseIntent(reply.understood) || null,
  });

  let run: ReturnType<typeof toAgentRunView> | undefined;
  if (reply.action.kind === "START_RUN") {
    await recordConversationEvent(db, {
      name: "domain_action_triggered",
      conversationId,
      actor: message.actor,
      channel: message.channel,
      data: { action: "START_RUN", category: reply.action.category ?? null },
    });
    const started = startAgentRun({
      request: reply.action.request ?? message.text,
      briefCorrection: reply.action.brief,
      buyerSessionId: conversationId,
      origin: options.origin,
      mode: options.mode,
    });
    run = toAgentRunView(started);
    void recordPilotEvent(db, {
      name: "conversation_run_started",
      actorKey: conversationId,
      props: { category: reply.action.category ?? null },
    });
    await recordConversationEvent(db, {
      name: "domain_action_completed",
      conversationId,
      actor: message.actor,
      channel: message.channel,
      data: { action: "START_RUN" },
    });
  }

  return {
    conversationId,
    actor: message.actor,
    channel: message.channel,
    messages: [{ kind: "text", text: reply.message }],
    stateChanges:
      reply.changed.length > 0 ? [{ kind: "buyer_intent_updated", fields: reply.changed }] : [],
    actions: reply.action.kind === "NONE" ? [] : [reply.action],
    notifications: [],
    reply,
    ...(run ? { run } : { openOrderIds: openTasks.map((task) => task.id) }),
  };
}

/**
 * Channel-independent conversation seam. This deliberately composes the
 * existing application services instead of introducing a parallel
 * ConversationService or moving domain rules into adapters.
 */
export async function handleInboundMessage(
  db: Database,
  rawMessage: InboundMessage,
  options: ConversationGatewayOptions,
): Promise<GatewayResult> {
  const actor = resolveActorReference(rawMessage.actor);
  const message: InboundMessage = {
    ...rawMessage,
    actor,
    externalConversationId: rawMessage.externalConversationId.trim(),
    externalMessageId: rawMessage.externalMessageId.trim(),
    text: rawMessage.text.trim(),
  };
  const conversationId = conversationSessionId(message);

  return processInboundOnce(db, message, async () => {
    const { context, created } = await bindConversationContext(db, {
      sessionId: conversationId,
      actor,
      channel: message.channel,
      externalConversationId: message.externalConversationId,
    });
    const conversationActor = context.actor;
    await recordConversationEvent(db, {
      name: "message_received",
      conversationId,
      actor: conversationActor,
      channel: message.channel,
    });

    try {
      const result =
        actor.role === "buyer"
          ? await buyerTurn(
              db,
              { ...message, actor: conversationActor },
              conversationId,
              created,
              options,
            )
          : actor.role === "business_owner" || actor.role === "business_operator"
            ? await handleBusinessOnboardingTurn(db, {
                conversationId,
                actor: conversationActor,
                channel: message.channel,
                text: message.text,
                workflowState: context.workflowState,
              })
            : {
                conversationId,
                actor: conversationActor,
                channel: message.channel,
                messages: [
                  {
                    kind: "text" as const,
                    text: "Agent conversations are not enabled through this gateway yet.",
                  },
                ],
                stateChanges: [],
                actions: [],
                notifications: [] as [],
              };

      await recordConversationEvent(db, {
        name: "response_generated",
        conversationId,
        actor: conversationActor,
        channel: message.channel,
        data: { messageCount: result.messages.length },
      });
      await recordConversationEvent(db, {
        name: "message_processed",
        conversationId,
        actor: conversationActor,
        channel: message.channel,
        data: { actionCount: result.actions.length, stateChangeCount: result.stateChanges.length },
      });
      return result;
    } catch (error) {
      await recordConversationEvent(db, {
        name: "processing_failed",
        conversationId,
        actor: conversationActor,
        channel: message.channel,
        data: { errorType: error instanceof Error ? error.name : "unknown" },
      });
      throw error;
    }
  });
}
