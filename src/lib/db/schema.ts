import { randomUUID } from "node:crypto";

import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
import { QUOTE_CONFIDENCE, QUOTE_STATUSES } from "@/features/quotes/status";
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
export const quoteCurrencyEnum = pgEnum("quote_currency", QUOTE_CURRENCIES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);
export const quoteConfidenceEnum = pgEnum("quote_confidence", QUOTE_CONFIDENCE);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);

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
  buyerWalletOptIn: boolean("buyer_wallet_opt_in").notNull().default(false),
  routeId: text("route_id").references(() => quoteRoutes.id, { onDelete: "set null" }),
  freeText: text("free_text"),
  structuredInput: jsonb("structured_input").$type<Record<string, unknown>>(),
  status: taskStatusEnum("status").notNull().default("DRAFT"),
  failureReason: text("failure_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
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
