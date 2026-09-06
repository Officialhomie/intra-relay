/**
 * Server analytics adapter (M9.5, brief §1, §29; ADR-021).
 *
 * The operational audit trail (`appendAuditEvent`, `recordPilotEvent`) is
 * unchanged and remains the source of operational truth. This module ONLY adds
 * the Amplitude arm for events with no browser actor, and it does so without
 * blocking or being able to break the caller:
 *
 *   - the forward is scheduled with `after()` so it runs post-response and
 *     keeps the serverless instance alive (mirrors agent/run/service.ts);
 *   - `forwardToAmplitude` swallows every error;
 *   - outside a request scope `after` throws, so we fall back to fire-and-forget.
 */

import { after } from "next/server";

import type { AnalyticsRole } from "./events";
import { SERVER_FORWARDED_EVENTS } from "./events";
import { forwardToAmplitude } from "./forward";
import type { AnalyticsProps } from "./properties";

export type ServerForwardedEvent = (typeof SERVER_FORWARDED_EVENTS)[number];

export interface ServerAnalyticsInput {
  event: ServerForwardedEvent;
  /** Amplitude user_id — an opaque session id or business id. */
  actorKey: string | null;
  role: Extract<AnalyticsRole, "buyer" | "business">;
  props?: AnalyticsProps;
  /** Dedupe key, e.g. `${event}:${entityId}`. */
  insertId?: string;
}

export type Scheduler = (fn: () => void) => void;

export const afterScheduler: Scheduler = (fn) => {
  try {
    after(fn);
  } catch {
    void fn();
  }
};

/**
 * Forward one actor-less event to Amplitude. Never awaits the network, never
 * throws. Call it right next to the existing audit/pilot write — it does not
 * replace it.
 */
export function forwardServerAnalyticsEvent(
  input: ServerAnalyticsInput,
  schedule: Scheduler = afterScheduler,
): void {
  try {
    schedule(() => {
      void forwardToAmplitude([
        {
          event: input.event,
          userId: input.actorKey,
          role: input.role,
          props: input.props,
          insertId: input.insertId,
        },
      ]);
    });
  } catch {
    // scheduling itself must never surface to the caller
  }
}
