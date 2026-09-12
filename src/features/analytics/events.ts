/**
 * The Intra analytics taxonomy (M9.5, brief §8–§21, §51; ADR-021).
 *
 * One controlled vocabulary, hand-written (no Ampli codegen — brief §28).
 * Naming convention: snake_case, stable, one meaning per event. If a meaning
 * genuinely changes, add a new name — never silently repurpose one (brief §51).
 *
 * Property rule (brief §10, §26): send structured METADATA, never raw text.
 * Intent events carry `intent_type` / `category` / `has_*` booleans, not the
 * message. Every prop is still run through `sanitizeProps` before it leaves the
 * process — this map is the intent, `properties.ts` is the enforcement.
 */

export type AnalyticsRole = "buyer" | "business" | "operator";
export type AnalyticsPlatform = "web" | "installed_pwa";
export type NotificationChannel = "in_app" | "push";

interface Empty {
  [key: string]: never;
}

/** name -> allowed event-property shape. */
export interface AnalyticsEventMap {
  // --- lifecycle -------------------------------------------------------------
  app_opened: {
    role: AnalyticsRole;
    platform: AnalyticsPlatform;
    pwa_installed: boolean;
    returning: boolean;
  };

  // --- buyer: conversation & intent ----------------------------------------
  conversation_started: Empty;
  message_sent: { turn_count: number };
  intent_detected: { intent_type?: string; category?: string; turn_count: number };
  intent_clarification_requested: {
    intent_field_missing?: string;
    clarification_count: number;
    turn_count: number;
  };
  intent_ready: {
    intent_type?: string;
    category?: string;
    /** The stated optimisation preference, or "UNSPECIFIED". Never the message. */
    optimization: string;
    has_quantity: boolean;
    has_location: boolean;
    has_deadline: boolean;
    has_budget: boolean;
    clarification_count: number;
  };

  // --- buyer: discovery -> decision --------------------------------------
  discovery_started: { category?: string };
  results_shown: { option_count: number; has_recommendation: boolean };
  result_selected: { option_rank?: number };
  approval_viewed: { quote_expired: boolean };
  approval_accepted: { pricing_model?: string; quote_expired: boolean };
  approval_declined: { reason_given: boolean };
  workflow_waiting: { workflow_stage: string };
  workflow_resumed: { notification_channel: NotificationChannel };
  workflow_completed: { via_notification: boolean };
  workflow_cancelled: { reason_code?: string };
  exception_viewed: { reason_code?: string };
  feedback_submitted: { useful: boolean; has_comment: boolean };

  // --- business: onboarding & readiness -----------------------------------
  business_onboarding_started: Empty;
  business_onboarding_completed: { category?: string; pricing_model?: string };
  service_added: { category?: string };
  pricing_configured: { pricing_model?: string };
  business_ready: { pricing_model?: string };

  // --- business: request -> quote -> fulfil ------------------------------
  request_received: {
    category?: string;
    pricing_model?: string;
    has_quantity: boolean;
    has_deadline: boolean;
    has_location: boolean;
    has_budget: boolean;
  };
  request_opened: { category?: string };
  request_declined: { reason_given: boolean };
  quote_started: Empty;
  quote_sent: { pricing_model?: string; turnaround_given: boolean };
  price_change_started: Empty;
  price_change_submitted: Empty;
  fulfillment_started: Empty;
  handover_started: Empty;
  handover_completed: { mode: "onchain" | "mock" };
  business_job_completed: Empty;

  // --- buyer: fulfilment (Proofline, M10 pilot funnel) --------------------
  /** The buyer's own confirmation they received the order — the missing symmetric half of `fulfillment_started`. */
  fulfilment_completed: { confirmation_method: string };

  // --- notifications ------------------------------------------------------
  attention_required: { domain_event: string; level: string; audience: string };
  notification_created: {
    domain_event: string;
    level: string;
    notification_channel: NotificationChannel;
  };
  push_sent: { domain_event: string };
  notification_opened: {
    domain_event: string;
    level: string;
    notification_channel: NotificationChannel;
  };
  notification_action_completed: { domain_event: string };

  // --- push / PWA -------------------------------------------------------
  push_permission_prompted: Empty;
  push_permission_granted: Empty;
  push_permission_denied: Empty;
  push_subscribed: Empty;
  push_unsubscribed: Empty;
  pwa_install_prompted: Empty;
  pwa_install_accepted: Empty;
  pwa_install_dismissed: Empty;

  // --- buyer order payment (MiniPay, M10.5) -----------------------------
  minipay_available: { minipay_available: boolean; wallet_available: boolean };
  payment_method_viewed: { minipay_available: boolean; wallet_available: boolean };
  minipay_selected: { payment_method: string };
  /** The server minted a payment intent (recipient/amount/asset resolved) — before the wallet is invoked. */
  payment_intent_created: { payment_method: string; network: number; asset: string };
  wallet_request_started: { payment_method: string; network: number; asset: string };
  wallet_approved: { payment_method: string; network: number; asset: string };
  wallet_rejected: { payment_method: string };
  payment_submitted: { payment_method: string; network: number; asset: string };
  payment_confirmed: { payment_method: string; network: number; asset: string };
  payment_failed: { payment_method: string; network: number; asset: string };
  payment_resumed: { payment_method: string };
  payment_receipt_viewed: { payment_method: string };

  // --- remote business onboarding via Tally (M10.1) -----------------------
  /** No PII/raw form content — see `sanitizeProps` and M10.1's observability note. */
  onboarding_received: Empty;
  onboarding_validated: { service_count: number; warning_count: number };
  onboarding_needs_review: { issue_count: number };
  onboarding_created: { warning_count: number };
  onboarding_pilot_ready: Empty;
  onboarding_failed: { reason_code: string };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/** Runtime list of every event name — used by tests and the tracking-plan doc. */
export const EVENT_NAMES = [
  "app_opened",
  "conversation_started",
  "message_sent",
  "intent_detected",
  "intent_clarification_requested",
  "intent_ready",
  "discovery_started",
  "results_shown",
  "result_selected",
  "approval_viewed",
  "approval_accepted",
  "approval_declined",
  "workflow_waiting",
  "workflow_resumed",
  "workflow_completed",
  "workflow_cancelled",
  "exception_viewed",
  "feedback_submitted",
  "business_onboarding_started",
  "business_onboarding_completed",
  "service_added",
  "pricing_configured",
  "business_ready",
  "request_received",
  "request_opened",
  "request_declined",
  "quote_started",
  "quote_sent",
  "price_change_started",
  "price_change_submitted",
  "fulfillment_started",
  "handover_started",
  "handover_completed",
  "business_job_completed",
  "fulfilment_completed",
  "attention_required",
  "notification_created",
  "push_sent",
  "notification_opened",
  "notification_action_completed",
  "push_permission_prompted",
  "push_permission_granted",
  "push_permission_denied",
  "push_subscribed",
  "push_unsubscribed",
  "pwa_install_prompted",
  "pwa_install_accepted",
  "pwa_install_dismissed",
  "minipay_available",
  "payment_method_viewed",
  "minipay_selected",
  "payment_intent_created",
  "wallet_request_started",
  "wallet_approved",
  "wallet_rejected",
  "payment_submitted",
  "payment_confirmed",
  "payment_failed",
  "payment_resumed",
  "payment_receipt_viewed",
  "onboarding_received",
  "onboarding_validated",
  "onboarding_needs_review",
  "onboarding_created",
  "onboarding_pilot_ready",
  "onboarding_failed",
] as const satisfies readonly AnalyticsEventName[];

/** Events forwarded from the server because they have no browser actor. */
export const SERVER_FORWARDED_EVENTS = [
  "request_received",
  "attention_required",
  "notification_created",
  "push_sent",
  "business_ready",
  // The buyer often closes the tab before the network confirms (M10.5 §22, §37).
  "payment_submitted",
  "payment_confirmed",
  "payment_failed",
  // A Tally webhook has no browser actor at all (M10.1).
  "onboarding_received",
  "onboarding_validated",
  "onboarding_needs_review",
  "onboarding_created",
  "onboarding_pilot_ready",
  "onboarding_failed",
] as const satisfies readonly AnalyticsEventName[];
