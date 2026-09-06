"use client";

/**
 * The browser analytics adapter (M9.5, brief §3, §4, §27, §29; ADR-021).
 *
 * The ONE place the Amplitude Browser SDK is touched. Every export is:
 *   - a no-op until `initAnalytics` runs with a real key;
 *   - wrapped so a thrown SDK / offline network / bad event never propagates
 *     (brief §4, §40, §41);
 *   - stamped with `environment` + `is_test` on every event so a single
 *     Amplitude project stays separable (brief §30).
 *
 * The SDK is loaded with a DYNAMIC import inside `initAnalytics` — never a
 * static top-level import. That keeps ~15 transitive packages out of the
 * initial bundle and out of the RSC / root-layout module graph (a static
 * import of it from a root-layout client component breaks Next's client-
 * reference resolution). Events fired before the SDK finishes loading are
 * queued and flushed on ready.
 *
 * Autocapture is deliberately narrow (brief §27): attribution + sessions only.
 */

import type { BrowserAnalyticsConfig } from "./config";
import type { AnalyticsEventMap, AnalyticsEventName } from "./events";
import type { AnalyticsIdentity } from "./identity";
import { sanitizeProps, type AnalyticsPrimitive, type AnalyticsProps } from "./properties";

type AmplitudeModule = typeof import("@amplitude/analytics-browser");

interface AdapterState {
  status: "idle" | "loading" | "ready" | "disabled";
  amplitude: AmplitudeModule | null;
  defaults: Record<string, AnalyticsPrimitive>;
  queue: Array<() => void>;
}

const MAX_QUEUE = 50;

let state: AdapterState = {
  status: "idle",
  amplitude: null,
  defaults: {},
  queue: [],
};

function safe(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[analytics] call failed (ignored):", error);
    }
  }
}

/** Run now if ready, else buffer until the SDK loads. */
function whenReady(fn: () => void): void {
  if (state.status === "ready") {
    safe(fn);
    return;
  }
  if (state.status === "disabled") return;
  if (state.queue.length < MAX_QUEUE) state.queue.push(fn);
}

export interface InitContext {
  isTest: boolean;
}

/** Idempotent. Safe to call with a disabled config — it stays a no-op. */
export function initAnalytics(config: BrowserAnalyticsConfig, context: InitContext): void {
  if (state.status !== "idle") return;

  if (!config.enabled || !config.apiKey) {
    state = { ...state, status: "disabled" };
    return;
  }

  state = { ...state, status: "loading" };

  void (async () => {
    try {
      const amplitude = await import("@amplitude/analytics-browser");
      amplitude.init(config.apiKey as string, {
        autocapture: {
          attribution: true,
          sessions: true,
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          elementInteractions: false,
        },
        serverZone: config.serverZone,
      });

      const defaults: Record<string, AnalyticsPrimitive> = {
        environment: config.environment,
        is_test: context.isTest,
      };
      const identify = new amplitude.Identify();
      identify.set("environment", config.environment);
      identify.set("is_test", context.isTest);
      amplitude.identify(identify);

      const queued = state.queue;
      state = { status: "ready", amplitude, defaults, queue: [] };
      for (const fn of queued) safe(fn);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[analytics] SDK failed to load (ignored):", error);
      }
      state = { status: "disabled", amplitude: null, defaults: {}, queue: [] };
    }
  })();
}

/** For tests only. */
export function __resetAnalyticsForTest(): void {
  state = { status: "idle", amplitude: null, defaults: {}, queue: [] };
}

export function isAnalyticsReady(): boolean {
  return state.status === "ready";
}

/**
 * Record one product event. `base` carries cross-cutting context (role,
 * platform) the caller already has; both it and `props` are sanitised.
 */
export function track<K extends AnalyticsEventName>(
  name: K,
  props: AnalyticsEventMap[K],
  base?: AnalyticsProps,
): void {
  const merged = { ...sanitizeProps(base), ...sanitizeProps(props as AnalyticsProps) };
  whenReady(() => {
    state.amplitude?.track(name, { ...state.defaults, ...merged });
  });
}

/** Attach the stable identity (brief §5). No-op if the id is missing. */
export function identifyUser(identity: AnalyticsIdentity): void {
  whenReady(() => {
    const amplitude = state.amplitude;
    if (!amplitude) return;
    if (identity.userId) amplitude.setUserId(identity.userId);
    const identify = new amplitude.Identify();
    identify.set("role", identity.role);
    amplitude.identify(identify);
    if (identity.businessId) amplitude.setGroup("business", identity.businessId);
  });
}

/**
 * Reset identity so the next account cannot inherit the previous one's
 * analytics identity (brief §5). Amplitude rotates the device id too.
 */
export function resetIdentity(): void {
  whenReady(() => state.amplitude?.reset());
}
