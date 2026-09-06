/**
 * Analytics configuration (M9.5, ADR-021).
 *
 * Product analytics (Amplitude) is a measurement layer that sits ALONGSIDE the
 * operational audit trail in `pilot.ts` — never a dependency of any commerce
 * action. When no key is configured the whole layer is a no-op and the product
 * is unaffected (brief §4, §41).
 *
 * Two independent keys:
 *   NEXT_PUBLIC_AMPLITUDE_API_KEY  browser key, read by the Browser SDK. Safe to
 *                                  expose — it can only WRITE events.
 *   AMPLITUDE_API_KEY              SERVER-ONLY. Used to forward the handful of
 *                                  events that have no browser actor
 *                                  (request_received, attention_required, …) via
 *                                  the HTTP V2 API. Never NEXT_PUBLIC_, never
 *                                  logged, never sent to the client.
 *
 * `environment` is stamped on every event so a single Amplitude project keeps
 * development / staging / production distinguishable (brief §30).
 */

export type AnalyticsEnvironment = "development" | "staging" | "production";

export function resolveAnalyticsEnvironment(raw: string | undefined | null): AnalyticsEnvironment {
  const value = raw?.trim().toLowerCase();
  if (value === "production" || value === "prod") return "production";
  if (value === "staging" || value === "preview") return "staging";
  return "development";
}

const US_HTTP_ENDPOINT = "https://api2.amplitude.com/2/httpapi";
const EU_HTTP_ENDPOINT = "https://api.eu.amplitude.com/2/httpapi";

function isEuZone(raw: string | undefined | null): boolean {
  return raw?.trim().toUpperCase() === "EU";
}

// --- browser -------------------------------------------------------------

export interface BrowserAnalyticsConfig {
  enabled: boolean;
  apiKey: string | null;
  environment: AnalyticsEnvironment;
  serverZone: "US" | "EU";
}

interface BrowserEnvSource {
  apiKey?: string | null;
  appEnv?: string | null;
  serverZone?: string | null;
}

/**
 * Read the browser config. The default argument references the
 * `NEXT_PUBLIC_*` literals directly so Next inlines them into the client
 * bundle at build time; tests pass an explicit source.
 */
export function readBrowserAnalyticsConfig(
  source: BrowserEnvSource = {
    apiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY,
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    serverZone: process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE,
  },
): BrowserAnalyticsConfig {
  const apiKey = source.apiKey?.trim() || null;
  return {
    apiKey,
    enabled: Boolean(apiKey),
    environment: resolveAnalyticsEnvironment(source.appEnv),
    serverZone: isEuZone(source.serverZone) ? "EU" : "US",
  };
}

// --- server -------------------------------------------------------------

export interface ServerAnalyticsConfig {
  enabled: boolean;
  apiKey: string | null;
  environment: AnalyticsEnvironment;
  endpoint: string;
}

export function readServerAnalyticsConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerAnalyticsConfig {
  const apiKey = env.AMPLITUDE_API_KEY?.trim() || null;
  return {
    apiKey,
    enabled: Boolean(apiKey),
    environment: resolveAnalyticsEnvironment(env.NEXT_PUBLIC_APP_ENV ?? env.APP_ENV),
    endpoint: isEuZone(env.AMPLITUDE_SERVER_ZONE) ? EU_HTTP_ENDPOINT : US_HTTP_ENDPOINT,
  };
}
