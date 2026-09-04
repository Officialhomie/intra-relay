import { randomUUID } from "node:crypto";

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  BUSINESS_CATEGORIES,
  BUSINESS_STATUSES,
  CONTACT_CHANNEL_TYPES,
} from "@/features/businesses/schema";
import { PAYMENT_STATUSES } from "@/features/payments/status";
import {
  PROOFLINE_ACTOR_ROLES,
  PROOFLINE_CONFIRMATION_METHODS,
  PROOFLINE_EVENT_TYPES,
  PROOFLINE_EVIDENCE_STATUSES,
} from "@/features/proofline/status";
import { COMMITMENT_EXPIRY_SOURCES, COMMITMENT_STATUSES } from "@/features/commitments/status";
import { ATTENTION_LEVELS, NOTIFICATION_AUDIENCES } from "@/features/notifications/attention";
import { PRICING_MODELS } from "@/features/pricing/model";
import { BUYER_DECISIONS, QUOTE_CONFIDENCE, QUOTE_STATUSES } from "@/features/quotes/status";
import { ROUTE_STATUSES, QUOTE_CURRENCIES } from "@/features/routes/schema";
import type { RouteInputField } from "@/features/routes/schema";
import { TASK_STATUSES } from "@/features/tasks/status";

/**
 * Intra persistence schema (PRD §10, TECHNICAL_SPEC §5).
 *
 * SAFETY: no column stores a private key, seed phrase, password, BVN/NIN, card
 * data, or bank credential (NFR-SEC-001). Wallet values are public addresses
 * only. `payment_authorisation` contents are never persisted (TECHNICAL_SPEC §6).
 */

const id = () => text("id").primaryKey().$defaultFn(randomUUID);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const businessStatusEnum = pgEnum("business_status", BUSINESS_STATUSES);
export const businessCategoryEnum = pgEnum("business_category", BUSINESS_CATEGORIES);
export const contactChannelEnum = pgEnum("contact_channel_type", CONTACT_CHANNEL_TYPES);
export const routeStatusEnum = pgEnum("route_status", ROUTE_STATUSES);
export const pricingModelEnum = pgEnum("pricing_model", PRICING_MODELS);
export const quoteCurrencyEnum = pgEnum("quote_currency", QUOTE_CURRENCIES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);
export const quoteConfidenceEnum = pgEnum("quote_confidence", QUOTE_CONFIDENCE);
export const buyerDecisionEnum = pgEnum("buyer_decision", BUYER_DECISIONS);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const commitmentStatusEnum = pgEnum("commitment_status", COMMITMENT_STATUSES);
export const commitmentExpirySourceEnum = pgEnum(
  "commitment_expiry_source",
  COMMITMENT_EXPIRY_SOURCES,
);
export const prooflineEventTypeEnum = pgEnum("proofline_event_type", PROOFLINE_EVENT_TYPES);
export const prooflineActorRoleEnum = pgEnum("proofline_actor_role", PROOFLINE_ACTOR_ROLES);
export const prooflineConfirmationMethodEnum = pgEnum(
  "proofline_confirmation_method",
  PROOFLINE_CONFIRMATION_METHODS,
);
export const prooflineEvidenceStatusEnum = pgEnum(
  "proofline_evidence_status",
  PROOFLINE_EVIDENCE_STATUSES,
);
export const notificationAudienceEnum = pgEnum("notification_audience", NOTIFICATION_AUDIENCES);
export const attentionLevelEnum = pgEnum("attention_level", ATTENTION_LEVELS);

export const businesses = pgTable("businesses", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  contactChannelType: contactChannelEnum("contact_channel_type").notNull(),
  contactChannelValue: text("contact_channel_value").notNull(),
  category: businessCategoryEnum("category").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  /** Public EVM/Celo address. Format-validated; ownership verified out of band. */
  payoutAddress: text("payout_address").notNull(),
  quoteCurrency: quoteCurrencyEnum("quote_currency").notNull(),
  /** Capability token: lets the supplier manage their own routes without an
   *  account (ADR-008). Never a wallet secret — a random opaque string. */
  manageToken: text("manage_token")
    .notNull()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`)
    .$defaultFn(() => randomUUID().replace(/-/g, "")),
  /** Set when the business consents to quote display (BR-002). */
  consentAt: timestamp("consent_at", { withTimezone: true }),
  /** Set by an operator on verification (AC-SUP-003). */
  verifiedByOperatorAt: timestamp("verified_by_operator_at", { withTimezone: true }),
  verifiedByOperatorLabel: text("verified_by_operator_label"),
  status: businessStatusEnum("status").notNull().default("DRAFT"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const quoteRoutes = pgTable(
  "quote_routes",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").$type<RouteInputField[]>().notNull(),
    queryFeeUsd: numeric("query_fee_usd", { precision: 10, scale: 4 }).notNull(),
    responseSlaMinutes: integer("response_sla_minutes").notNull(),
    quoteCurrency: quoteCurrencyEnum("quote_currency").notNull(),
    /**
     * How this service is priced (milestone 5). Published pricing is guidance a
     * buyer can compare before asking; the quote the business sends for a
     * specific request is still the only commitment (BR-003).
     */
    pricingModel: pricingModelEnum("pricing_model").notNull().default("QUOTE_REQUIRED"),
    /** The published amount, in `quoteCurrency`. Null for a priced-per-job service. */
    priceAmount: numeric("price_amount", { precision: 14, scale: 2 }),
    /** What the published amount buys, e.g. "per page". Null for a flat job price. */
    priceUnit: text("price_unit"),
    payoutAddress: text("payout_address").notNull(),
    endpoint: text("endpoint").notNull(),
    status: routeStatusEnum("status").notNull().default("DRAFT"),
    /** Freshness: when the supplier last confirmed the price data is current. */
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Operator's recorded pre-activation checks (AC-SUP-003 + PRD activation). */
    activationChecklist: jsonb("activation_checklist").$type<Record<string, boolean>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("quote_routes_business_slug_uq").on(table.businessId, table.slug)],
);

export const tasks = pgTable("tasks", {
  id: id(),
  /** Opaque buyer session identifier (no account, no wallet login). */
  sessionId: text("session_id").notNull(),
  /**
   * The human buyer session that owns this task when it was created on their
   * behalf by an agent (milestone 6 §17). `sessionId` then holds the agent
   * session; this holds the browser session that started the run. Set once, at
   * task creation, by whoever creates the task — it can never be changed
   * afterwards, so it cannot be used to seize someone else's task. Buyer
   * decisions authorise on a match against either column.
   */
  buyerClaimSession: text("buyer_claim_session"),
  buyerWalletOptIn: boolean("buyer_wallet_opt_in").notNull().default(false),
  routeId: text("route_id").references(() => quoteRoutes.id, { onDelete: "set null" }),
  freeText: text("free_text"),
  structuredInput: jsonb("structured_input").$type<Record<string, unknown>>(),
  status: taskStatusEnum("status").notNull().default("DRAFT"),
  failureReason: text("failure_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  /** Set when a supplier response (quote or decline) is first recorded. */
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  /** The buyer's explicit choice on the quote (FR-REC-004). Null until they decide. */
  buyerDecision: buyerDecisionEnum("buyer_decision"),
  buyerDecidedAt: timestamp("buyer_decided_at", { withTimezone: true }),
  /** Optional free-text reason the buyer gave when declining a quote. */
  buyerDeclineReason: text("buyer_decline_reason"),
  /** Set when the buyer confirms they personally sent the WhatsApp handoff. */
  handoffConfirmedAt: timestamp("handoff_confirmed_at", { withTimezone: true }),
  /** Set when the task first reaches a terminal state (HANDOFF_READY / FAILED / CANCELLED). */
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const quotes = pgTable("quotes", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  routeId: text("route_id")
    .notNull()
    .references(() => quoteRoutes.id, { onDelete: "cascade" }),
  amountMin: numeric("amount_min", { precision: 14, scale: 2 }).notNull(),
  amountMax: numeric("amount_max", { precision: 14, scale: 2 }),
  currency: quoteCurrencyEnum("currency").notNull(),
  turnaround: text("turnaround").notNull(),
  availabilityNote: text("availability_note"),
  deliveryCharge: numeric("delivery_charge", { precision: 14, scale: 2 }),
  assumptions: text("assumptions"),
  confidence: quoteConfidenceEnum("confidence"),
  fixed: boolean("fixed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: quoteStatusEnum("status").notNull().default("RECEIVED"),
  /** Set when a supplier declines out of area / capacity. */
  declineReason: text("decline_reason"),
  /**
   * Quote integrity (milestone 5). An offer is never edited in place: a new
   * price is a NEW row pointing back at the one it replaces, so the terms the
   * buyer actually saw and agreed to stay readable forever.
   */
  supersedesQuoteId: text("supersedes_quote_id"),
  /** 1 for the first offer on a task, incremented for each replacement. */
  revision: integer("revision").notNull().default(1),
  /** Set the moment a buyer accepts THIS row. An accepted row is immutable. */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** Why the business proposed a different price, in their own words. */
  changeReason: text("change_reason"),
  createdAt: createdAt(),
});

export const recommendations = pgTable("recommendations", {
  id: id(),
  /** One recommendation per task (TECHNICAL_SPEC §5). */
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: "cascade" }),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  rationale: text("rationale").notNull(),
  confidence: quoteConfidenceEnum("confidence"),
  /** Pre-filled WhatsApp order message. Generated, never auto-sent (FR-REC-002). */
  orderMessage: text("order_message").notNull(),
  createdAt: createdAt(),
});

export const feedback = pgTable("feedback", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  useful: boolean("useful").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

/**
 * Agent service-payment records. **Append-only / immutable** — a row is written
 * once with its final status. A SETTLED row is never edited (BR-005).
 */
export const servicePayments = pgTable("service_payments", {
  id: id(),
  /** Nullable: a FAILED payment attempt has no task (no service was rendered). */
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  routeId: text("route_id").references(() => quoteRoutes.id, { onDelete: "set null" }),
  service: text("service").notNull(),
  resource: text("resource").notNull(),
  maxFeeUsd: numeric("max_fee_usd", { precision: 10, scale: 4 }).notNull(),
  provider: text("provider"),
  network: text("network"),
  asset: text("asset"),
  assetSymbol: text("asset_symbol"),
  /** Settled amount in the asset's atomic units. */
  amountAtomic: text("amount_atomic"),
  payer: text("payer"),
  payee: text("payee"),
  status: paymentStatusEnum("status").notNull().default("NOT_REQUIRED"),
  /** Unique when present (BR-005). Manual entry is not allowed. */
  txHash: text("tx_hash").unique(),
  /** One-way hash of the signed authorisation — dedupes duplicate X-PAYMENT retries. */
  authorizationKey: text("authorization_key").unique(),
  /** ERC-8021 attribution tag, only when configured from hackathon registration. */
  attributionTag: text("attribution_tag"),
  errorCode: text("error_code"),
  /** Official facilitator verify/settle result. Never a signature or auth payload. */
  verification: jsonb("verification").$type<Record<string, unknown>>(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: id(),
  type: text("type").notNull(),
  taskId: text("task_id"),
  businessId: text("business_id"),
  routeId: text("route_id"),
  quoteId: text("quote_id"),
  paymentId: text("payment_id"),
  data: jsonb("data")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
});

/**
 * Proofline pilot — append-only fulfilment-evidence log (PRODUCT_VISION §3.2,
 * ADR-016). Two event types only, both optional, both after a buyer handoff.
 * Not escrow, not settlement, not a reliability score. A row is written once.
 */
export const prooflineEvents = pgTable("proofline_events", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  eventType: prooflineEventTypeEnum("event_type").notNull(),
  actorRole: prooflineActorRoleEnum("actor_role").notNull(),
  confirmationMethod: prooflineConfirmationMethodEnum("confirmation_method").notNull(),
  /** The order's fulfilment-evidence status established by this event. */
  evidenceStatus: prooflineEvidenceStatusEnum("evidence_status").notNull(),
  /**
   * Short pickup code the merchant hands the buyer at collection. Only on a
   * READY_FOR_PICKUP row. Not sensitive data (NFR-SEC-001): a low-stakes,
   * single-order confirmation nonce — never a key, password, or identity value.
   */
  pickupCode: text("pickup_code"),
  createdAt: createdAt(),
});

/**
 * Approved-quote commitments (ADR-018, milestone 2).
 *
 * One row per approved task — `taskId` is unique, which is what makes the
 * attestation write idempotent: a retry finds the existing row rather than
 * creating a second commitment.
 *
 * `handoverSalt` and `handoverCode` are SERVER-ONLY. They are never returned by
 * an API, never logged, and never placed in a trace (NFR-SEC-001). Only
 * `handoverCommit` is public and only it goes on-chain.
 */
export const commitments = pgTable("commitments", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: "cascade" }),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  /** keccak256 of the task id. The only job identifier that reaches a chain. */
  jobRef: text("job_ref").notNull(),
  /** Provider payout address (public EVM address, verified out of band). */
  providerAddress: text("provider_address").notNull(),
  /** ERC-8004 agentId once the business is registered; 0 until then. */
  providerAgentId: text("provider_agent_id").notNull().default("0"),
  /** Buyer wallet when one is bound; the zero address otherwise. */
  buyerAddress: text("buyer_address").notNull(),
  /** Quoted total (price + delivery) in minor units of `currency`. */
  amountMinor: text("amount_minor").notNull(),
  currency: quoteCurrencyEnum("currency").notNull(),
  /** Token address, or the zero address when denominated off-chain. */
  assetAddress: text("asset_address").notNull(),
  quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  expirySource: commitmentExpirySourceEnum("expiry_source").notNull(),
  /** Public commit-reveal hash. Safe on-chain. */
  handoverCommit: text("handover_commit").notNull(),
  /** SERVER-ONLY. Withheld until a correct code is presented (ADR-018). */
  handoverSalt: text("handover_salt").notNull(),
  /** SERVER-ONLY. Delivered to the buyer alone. */
  handoverCode: text("handover_code").notNull(),
  status: commitmentStatusEnum("status").notNull().default("PENDING_ATTESTATION"),
  /** EAS attestation UID once written. */
  attestationUid: text("attestation_uid"),
  attestationTxHash: text("attestation_tx_hash"),
  /** "mock" or "onchain" — never presented as real unless "onchain". */
  attestationMode: text("attestation_mode"),
  attestationError: text("attestation_error"),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Human-attention notifications (milestone 7 §13–§15).
 *
 * A notification is a *current* attention item, not a log line — the audit
 * trail is the history. One row per (audience, recipient, dedupeKey): a repeat
 * event about the same thing updates that row and re-surfaces it as unread
 * (§21), rather than piling up duplicates. Copy is user-facing (§17) and never
 * carries a secret, a full address, or a raw amount (§18) — the linked page
 * shows protected detail after the person is authorised.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    audience: notificationAudienceEnum("audience").notNull(),
    /** BUYER: the buyer session that owns the task. BUSINESS: the business id. */
    recipientKey: text("recipient_key").notNull(),
    /** Semantic domain event that produced it. Never shown raw. */
    event: text("event").notNull(),
    level: attentionLevelEnum("level").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Where opening it takes the person. A relative in-app path only. */
    deeplink: text("deeplink").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** Collapses repeat events about the same attention item. */
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Set when a web-push delivery for this row was attempted. */
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_uq").on(table.audience, table.recipientKey, table.dedupeKey),
    index("notifications_recipient_idx").on(table.audience, table.recipientKey),
  ],
);

/**
 * Web-push subscriptions (milestone 7 §16). The `p256dh` / `auth` values are
 * the subscription's own public key material — not a user secret. A subscription
 * that the push service rejects as gone is deleted, not kept.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    audience: notificationAudienceEnum("audience").notNull(),
    recipientKey: text("recipient_key").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** A coarse UA string, for the person to recognise a device. No fingerprinting. */
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index("push_subscriptions_recipient_idx").on(table.audience, table.recipientKey)],
);

/**
 * Per-recipient notification preferences (milestone 7 §16). Deliberately tiny —
 * the person controls whether push happens at all, and whether the low-priority
 * (informational) notifications reach them; action-required always does while
 * push is on. One row per (audience, recipientKey); absent row = defaults.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    audience: notificationAudienceEnum("audience").notNull(),
    recipientKey: text("recipient_key").notNull(),
    /** Master switch for browser/OS push. In-app notifications are unaffected. */
    pushEnabled: boolean("push_enabled").notNull().default(false),
    /** Push the low-priority informational / completed updates too. */
    pushInformational: boolean("push_informational").notNull().default(false),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_preferences_recipient_uq").on(table.audience, table.recipientKey),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<unknown>().notNull(),
    responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("idempotency_scope_key_uq").on(table.scope, table.key)],
);

export const businessesRelations = relations(businesses, ({ many }) => ({
  routes: many(quoteRoutes),
}));

export const quoteRoutesRelations = relations(quoteRoutes, ({ one, many }) => ({
  business: one(businesses, {
    fields: [quoteRoutes.businessId],
    references: [businesses.id],
  }),
  quotes: many(quotes),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  route: one(quoteRoutes, { fields: [tasks.routeId], references: [quoteRoutes.id] }),
  quotes: many(quotes),
  payments: many(servicePayments),
  recommendation: one(recommendations),
  feedback: many(feedback),
  prooflineEvents: many(prooflineEvents),
}));

export const commitmentsRelations = relations(commitments, ({ one }) => ({
  task: one(tasks, { fields: [commitments.taskId], references: [tasks.id] }),
  quote: one(quotes, { fields: [commitments.quoteId], references: [quotes.id] }),
  business: one(businesses, { fields: [commitments.businessId], references: [businesses.id] }),
}));

export const prooflineEventsRelations = relations(prooflineEvents, ({ one }) => ({
  task: one(tasks, { fields: [prooflineEvents.taskId], references: [tasks.id] }),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  task: one(tasks, { fields: [quotes.taskId], references: [tasks.id] }),
  route: one(quoteRoutes, { fields: [quotes.routeId], references: [quoteRoutes.id] }),
}));

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  task: one(tasks, { fields: [recommendations.taskId], references: [tasks.id] }),
  quote: one(quotes, { fields: [recommendations.quoteId], references: [quotes.id] }),
}));

export const servicePaymentsRelations = relations(servicePayments, ({ one }) => ({
  task: one(tasks, { fields: [servicePayments.taskId], references: [tasks.id] }),
}));

export type BusinessRow = typeof businesses.$inferSelect;
export type NewBusinessRow = typeof businesses.$inferInsert;
export type QuoteRouteRow = typeof quoteRoutes.$inferSelect;
export type NewQuoteRouteRow = typeof quoteRoutes.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type QuoteRow = typeof quotes.$inferSelect;
export type RecommendationRow = typeof recommendations.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
export type ServicePaymentRow = typeof servicePayments.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type CommitmentRow = typeof commitments.$inferSelect;
export type NewCommitmentRow = typeof commitments.$inferInsert;
export type ProoflineEventRow = typeof prooflineEvents.$inferSelect;
export type NewProoflineEventRow = typeof prooflineEvents.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferenceRow = typeof notificationPreferences.$inferInsert;
