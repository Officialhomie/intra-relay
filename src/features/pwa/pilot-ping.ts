import { apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

/**
 * Fire-and-forget client pilot event (milestone 7 phase C §32). Never blocks
 * or throws — instrumentation must not affect the experience it measures.
 */
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
}
