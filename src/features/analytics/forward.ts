/**
 * Server-side forwarding to Amplitude's HTTP V2 API (M9.5, brief §3, §19; ADR-021).
 *
 * A THIN `fetch` — deliberately not `@amplitude/analytics-node`, to keep a
 * single Amplitude SDK in the tree (brief §3). Used only for the handful of
 * events that have no browser actor (see `SERVER_FORWARDED_EVENTS`): a request
 * reaching a business, a workflow needing attention, a push being dispatched.
 *
 * SERVER-ONLY. Gated on `AMPLITUDE_API_KEY`; unset ⇒ silent no-op. Every call is
 * fire-and-forget and swallows all errors — forwarding must never affect the
 * action that triggered it (brief §4, §40, §41). The audit trail records these
 * events regardless.
 */

import { readServerAnalyticsConfig, type ServerAnalyticsConfig } from "./config";
import type { AnalyticsEventName } from "./events";
import { sanitizeProps, type AnalyticsProps } from "./properties";

export interface ForwardEvent {
  event: AnalyticsEventName;
  /** Amplitude `user_id` — an opaque session id or business id. */
  userId: string | null;
  role: string;
  props?: AnalyticsProps;
  /** ms epoch; defaults to now. */
  time?: number;
  /** Dedupe key — Amplitude ignores a repeat within 7 days. */
  insertId?: string;
}

const REQUEST_TIMEOUT_MS = 5000;

export async function forwardToAmplitude(
  events: ForwardEvent[],
  config: ServerAnalyticsConfig = readServerAnalyticsConfig(),
): Promise<void> {
  if (!config.enabled || !config.apiKey || events.length === 0) return;

  const payload = {
    api_key: config.apiKey,
    events: events
      .filter((event) => Boolean(event.userId))
      .map((event) => ({
        user_id: event.userId as string,
        event_type: event.event,
        time: event.time ?? Date.now(),
        ...(event.insertId ? { insert_id: event.insertId } : {}),
        event_properties: {
          environment: config.environment,
          ...sanitizeProps(event.props),
        },
        user_properties: {
          role: event.role,
          environment: config.environment,
        },
      })),
  };

  if (payload.events.length === 0) return;

  try {
    await fetch(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // fire-and-forget — never propagate
  }
}
