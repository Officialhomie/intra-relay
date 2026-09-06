import { track } from "@/features/analytics/client";
import type { AnalyticsEventName } from "@/features/analytics/events";
import { apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

/**
 * Fire-and-forget client pilot event (milestone 7 phase C §32). Never blocks
 * or throws — instrumentation must not affect the experience it measures.
 *
 * M9.5: the push/PWA events also mirror to product analytics (Amplitude) via
 * the client adapter, which is itself a no-op when analytics is disabled.
 */

/** Push / PWA pilot events that are also product-analytics events (M9.5 §20, §21). */
const ANALYTICS_MIRRORED = new Set<string>([
  "push_permission_prompted",
  "push_permission_granted",
  "push_permission_denied",
  "push_subscribed",
  "push_unsubscribed",
  "pwa_install_prompted",
  "pwa_install_accepted",
  "pwa_install_dismissed",
]);

export function pilotPing(
  name: string,
  options: { authQuery?: string; props?: Record<string, string | number | boolean> } = {},
): void {
  const suffix = options.authQuery ? `?${options.authQuery}` : "";
  void apiRequest(`/api/pilot/event${suffix}`, {
    method: "POST",
    ...(options.authQuery ? {} : { sessionId: getSessionId() }),
    body: { name, props: options.props },
  }).catch(() => undefined);

  if (ANALYTICS_MIRRORED.has(name)) {
    try {
      track(name as AnalyticsEventName, {} as never);
    } catch {
      /* analytics never affects the caller */
    }
  }
}
