import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { quickStartBusiness, quickStartSchema } from "@/features/businesses/quick-start";
import { recordTurn } from "@/features/intent/memory";
import { applyPrintingRouteFacts } from "@/features/routes/printing-capability";
import { extractPrintingProductTypes } from "@/features/routes/printing-products";

import { updateConversationWorkflow } from "./state";
import { recordConversationEvent } from "./observability";
import type {
  ActorReference,
  ConversationChannel,
  ConversationResult,
  ConversationStateChange,
  GatewayAction,
} from "./types";

const factsSchema = z.object({
  businessName: z.string().max(80).optional(),
  category: z.literal("printing").optional(),
  serviceName: z.string().max(80).optional(),
  pricingModel: z.enum(["FIXED", "STARTING_FROM", "QUOTE_REQUIRED"]).optional(),
  priceAmount: z.number().positive().optional(),
  priceUnit: z.string().max(40).optional(),
  quoteCurrency: z.literal("NGN").optional(),
  serviceArea: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  country: z.literal("Nigeria").optional(),
  contactName: z.string().max(80).optional(),
  contactChannelValue: z.string().max(120).optional(),
  consentToQuoteDisplay: z.literal(true).optional(),
  productTypes: z.array(z.string()).optional(),
  deliveryAvailable: z.boolean().optional(),
  turnaround: z.string().max(120).optional(),
});

type BusinessFacts = z.infer<typeof factsSchema>;

const workflowSchema = z.object({
  kind: z.literal("business_onboarding"),
  facts: factsSchema,
  pendingField: z.string().nullable(),
  created: z
    .object({
      businessId: z.string(),
      routeId: z.string(),
      slug: z.string(),
      manageUrl: z.string(),
    })
    .optional(),
});

type BusinessWorkflow = z.infer<typeof workflowSchema>;

const QUESTIONS: ReadonlyArray<[keyof BusinessFacts, string]> = [
  ["businessName", "What is your business called?"],
  ["category", "Is this a printing business?"],
  ["serviceName", "Which printing service should we set up first?"],
  ["pricingModel", "Do you publish a fixed/starting price, or quote each job?"],
  ["priceAmount", "What starting price should customers see?"],
  ["serviceArea", "Which area do you serve or accept pick-up from?"],
  ["city", "Which city are you based in?"],
  ["contactName", "Who should customers ask for?"],
  ["contactChannelValue", "What WhatsApp number receives orders?"],
  [
    "consentToQuoteDisplay",
    "Do you agree that Intra may request and display quotes for your business?",
  ],
];

const PRODUCT_LABELS: Record<string, string> = {
  business_cards: "Business cards",
  flyers: "Flyers",
  posters: "Posters",
  banners: "Banners",
  stickers: "Stickers",
  brochures: "Brochures",
  booklets: "Booklets",
  invitations: "Invitations",
  apparel: "Apparel",
  packaging: "Packaging",
  labels: "Labels",
  large_format: "Large-format printing",
  signage: "Signage",
  documents: "Document printing",
};

function initialWorkflow(value: unknown): BusinessWorkflow {
  const parsed = workflowSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { kind: "business_onboarding", facts: {}, pendingField: null };
}

function plainAnswer(text: string): string {
  return text
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

function readAmount(text: string): number | undefined {
  const match = text.match(/(?:₦|NGN\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/i);
  if (!match) return undefined;
  let amount = Number(match[1].replace(/,/g, ""));
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k" || suffix === "thousand") amount *= 1_000;
  if (suffix === "m" || suffix === "million") amount *= 1_000_000;
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function serviceName(products: string[]): string {
  const labels = products.map((product) => PRODUCT_LABELS[product] ?? product);
  if (labels.length === 1) return `${labels[0]} printing`;
  const last = labels.at(-1);
  return `${labels.slice(0, -1).join(", ")} and ${last}`.slice(0, 80);
}

/** Bounded deterministic interpretation. It can only fill the validated
 * onboarding fact schema; it cannot produce a database patch. */
export function extractBusinessOnboardingFacts(
  text: string,
  prior: BusinessFacts,
  pendingField: string | null,
): BusinessFacts {
  const next: BusinessFacts = {
    ...prior,
    country: prior.country ?? "Nigeria",
    quoteCurrency: "NGN",
  };
  const answer = plainAnswer(text);

  const named = text.match(
    /\b(?:business is (?:called|named)|business called|company called)\s+([^,.!?]+)/i,
  );
  if (named) next.businessName = named[1].trim().slice(0, 80);
  else if (pendingField === "businessName" && answer.length >= 2)
    next.businessName = answer.slice(0, 80);

  const products = extractPrintingProductTypes(text);
  if (/\bprint(?:er|ing|s|ed)?\b/i.test(text) || products.length > 0) next.category = "printing";
  if (products.length > 0) {
    next.productTypes = [...new Set([...(prior.productTypes ?? []), ...products])];
    next.serviceName = serviceName(next.productTypes);
  } else if (pendingField === "serviceName" && answer.length >= 3) {
    next.serviceName = answer.slice(0, 80);
  }

  if (/\b(?:quote|price) (?:each|every) job\b|\bpriced? per job\b/i.test(text)) {
    next.pricingModel = "QUOTE_REQUIRED";
    delete next.priceAmount;
  } else if (/\bstarting (?:at|from)|\bfrom\s*₦/i.test(text)) {
    next.pricingModel = "STARTING_FROM";
  } else if (/\bfixed price\b/i.test(text)) {
    next.pricingModel = "FIXED";
  }
  if (pendingField === "pricingModel") {
    if (/\bquote\b/i.test(text)) next.pricingModel = "QUOTE_REQUIRED";
    if (/\bstarting\b/i.test(text)) next.pricingModel = "STARTING_FROM";
    if (/\bfixed\b/i.test(text)) next.pricingModel = "FIXED";
  }
  if (next.pricingModel !== "QUOTE_REQUIRED") {
    const amount = readAmount(text);
    if (amount) next.priceAmount = amount;
  }

  const lagos = /\bLagos\b/i.test(text);
  if (lagos) {
    next.city = "Lagos";
    if (/\b(?:deliver|serve|service|coverage|across|around|within)\b/i.test(text)) {
      next.serviceArea = "Lagos";
    }
  }
  if (/\b(?:we |i )?deliver\b/i.test(text)) next.deliveryAvailable = true;
  if (/\b(?:do not|don'?t) deliver\b/i.test(text)) next.deliveryAvailable = false;
  if (pendingField === "serviceArea" && answer.length >= 2) next.serviceArea = answer.slice(0, 120);
  if (pendingField === "city" && answer.length >= 2) next.city = answer.slice(0, 80);

  const turnaround = text.match(
    /\b(\d+\s*(?:-|to)\s*\d+\s*(?:working\s+)?days?|\d+\s*(?:working\s+)?days?)\b/i,
  );
  if (turnaround) next.turnaround = turnaround[1];

  const contactName = text.match(
    /\b(?:contact|ask for|my name is)\s+(?:is\s+)?([A-Za-z][A-Za-z '-]{1,79}?)(?=\s+(?:and|our)\b|[,.!?]|$)/i,
  );
  if (contactName) next.contactName = contactName[1].trim().slice(0, 80);
  else if (pendingField === "contactName" && answer.length >= 2)
    next.contactName = answer.slice(0, 80);

  const phone = text.match(/(?:\+?234|0)[\d\s()-]{8,16}\d/);
  if (phone) next.contactChannelValue = phone[0].replace(/[\s()-]/g, "");
  else if (pendingField === "contactChannelValue" && answer.length >= 3) {
    next.contactChannelValue = answer.slice(0, 120);
  }

  if (/\b(?:I agree|I consent|yes,? you may|yes,? I agree)\b/i.test(text)) {
    next.consentToQuoteDisplay = true;
  }
  return factsSchema.parse(next);
}

function nextMissing(facts: BusinessFacts): [keyof BusinessFacts, string] | null {
  for (const [field, question] of QUESTIONS) {
    if (field === "priceAmount" && facts.pricingModel === "QUOTE_REQUIRED") continue;
    if (facts[field] == null) return [field, question];
  }
  return null;
}

function stateChanges(before: BusinessFacts, after: BusinessFacts): ConversationStateChange[] {
  const fields = Object.keys(after).filter(
    (field) =>
      JSON.stringify(before[field as keyof BusinessFacts]) !==
      JSON.stringify(after[field as keyof BusinessFacts]),
  );
  return fields.length > 0 ? [{ kind: "business_onboarding_updated", fields }] : [];
}

export async function handleBusinessOnboardingTurn(
  db: Database,
  input: {
    conversationId: string;
    actor: ActorReference;
    channel: ConversationChannel;
    text: string;
    workflowState: Record<string, unknown> | null;
  },
): Promise<ConversationResult> {
  const workflow = initialWorkflow(input.workflowState);
  if (workflow.created) {
    const message =
      "This business profile has already been created and is waiting for operator review.";
    await recordTurn(db, {
      sessionId: input.conversationId,
      userText: input.text,
      extracted: {},
      intentKind: "CONVERSATION",
      assistantText: message,
    });
    return {
      conversationId: input.conversationId,
      actor: input.actor,
      channel: input.channel,
      messages: [{ kind: "text", text: message }],
      stateChanges: [],
      actions: [],
      notifications: [],
      business: {
        id: workflow.created.businessId,
        slug: workflow.created.slug,
        routeId: workflow.created.routeId,
        manageUrl: workflow.created.manageUrl,
      },
    };
  }

  const facts = extractBusinessOnboardingFacts(input.text, workflow.facts, workflow.pendingField);
  const missing = nextMissing(facts);
  let message: string;
  let actions: GatewayAction[] = [];
  let created: BusinessWorkflow["created"];

  if (missing) {
    message = missing[1];
  } else {
    const parsed = quickStartSchema.parse(facts);
    await recordConversationEvent(db, {
      name: "domain_action_triggered",
      conversationId: input.conversationId,
      actor: input.actor,
      channel: input.channel,
      data: { action: "CREATE_BUSINESS_PROFILE" },
    });
    const result = await quickStartBusiness(db, parsed);
    const route = await applyPrintingRouteFacts(db, result.route, {
      productTypes: facts.productTypes ?? [],
      pricingModel: parsed.pricingModel,
      serviceArea: parsed.serviceArea,
      city: parsed.city,
      pickupAvailable: null,
      deliveryAvailable: facts.deliveryAvailable ?? null,
      turnaround: facts.turnaround ?? null,
      minimumOrders: null,
    });
    created = {
      businessId: result.business.id,
      routeId: route.id,
      slug: result.business.slug,
      manageUrl: result.manageUrl,
    };
    message = `Your business profile is saved as a draft. ${result.nextStep}`;
    actions = [
      {
        kind: "CREATE_BUSINESS_PROFILE",
        status: "COMPLETED",
        businessId: result.business.id,
        routeId: route.id,
      },
    ];
    await recordConversationEvent(db, {
      name: "domain_action_completed",
      conversationId: input.conversationId,
      actor: { ...input.actor, businessId: result.business.id },
      channel: input.channel,
      businessId: result.business.id,
      data: { action: "CREATE_BUSINESS_PROFILE" },
    });
  }

  await recordTurn(db, {
    sessionId: input.conversationId,
    userText: input.text,
    extracted: {},
    intentKind: "CONVERSATION",
    assistantText: message,
  });
  const nextWorkflow: BusinessWorkflow = {
    kind: "business_onboarding",
    facts,
    pendingField: missing?.[0] ?? null,
    ...(created ? { created } : {}),
  };
  await updateConversationWorkflow(db, input.conversationId, {
    workflowState: nextWorkflow,
    pendingQuestion: missing?.[1] ?? null,
    lastAction: actions[0]?.kind ?? "NONE",
    summary: [facts.businessName, facts.serviceName].filter(Boolean).join(" — ") || null,
    ...(created ? { businessId: created.businessId } : {}),
  });

  const changes = stateChanges(workflow.facts, facts);
  if (created) changes.push({ kind: "domain_entity_created", fields: ["business", "route"] });
  return {
    conversationId: input.conversationId,
    actor: { ...input.actor, ...(created ? { businessId: created.businessId } : {}) },
    channel: input.channel,
    messages: [{ kind: "text", text: message }],
    stateChanges: changes,
    actions,
    notifications: [],
    ...(created
      ? {
          business: {
            id: created.businessId,
            slug: created.slug,
            routeId: created.routeId,
            manageUrl: created.manageUrl,
          },
        }
      : {}),
  };
}
