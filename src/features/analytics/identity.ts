/**
 * Analytics identity + viewer context (M9.5, brief §5–§7, §21, §31; ADR-021).
 *
 * Identity rules:
 *   buyer     -> the opaque per-device session id (`intra.sessionId`). No
 *                account, no wallet, no PII — it is already the right stable
 *                internal identifier (brief §5).
 *   business  -> the internal business id (uuid). Also a group.
 *   operator  -> never identified into Amplitude.
 *
 * Never an identifier: email, phone, wallet data, business name, address.
 */

import type { AnalyticsPlatform, AnalyticsRole } from "./events";

const TEST_FLAG_KEY = "intra.analytics.test";
const TEST_QUERY_PARAM = "intra_test";
const APP_OPENED_MARK = "intra.analytics.opened";

export interface AnalyticsIdentity {
  role: AnalyticsRole;
  userId: string | null;
  /** Present for business viewers — enables business-level analysis (brief §32). */
  businessId?: string | null;
}

export function buyerIdentity(sessionId: string | null | undefined): AnalyticsIdentity {
  const id = sessionId?.trim();
  return { role: "buyer", userId: id && id.length >= 8 ? id : null };
}

export function businessIdentity(businessId: string | null | undefined): AnalyticsIdentity {
  const id = businessId?.trim() || null;
  return { role: "business", userId: id, businessId: id };
}

// --- viewer context (client only) --------------------------------------

/** `installed_pwa` when the app is running from the home screen. */
export function detectPlatform(): AnalyticsPlatform {
  if (typeof window === "undefined") return "web";
  try {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return standalone ? "installed_pwa" : "web";
  } catch {
    return "web";
  }
}

/**
 * A test viewer is excluded from production cohorts (brief §31). The flag is set
 * by an operator during a pilot and persists; `?intra_test=1` also sets it.
 */
export function isTestViewer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(TEST_QUERY_PARAM) === "1") {
      window.localStorage.setItem(TEST_FLAG_KEY, "1");
      return true;
    }
    if (params.get(TEST_QUERY_PARAM) === "0") {
      window.localStorage.removeItem(TEST_FLAG_KEY);
      return false;
    }
    return window.localStorage.getItem(TEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * True the first time the app is opened in this browser storage — lets
 * `app_opened` carry `returning: false` on the genuine first visit (brief §7).
 */
export function markAppOpenedAndWasReturning(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const seen = window.localStorage.getItem(APP_OPENED_MARK) === "1";
    window.localStorage.setItem(APP_OPENED_MARK, "1");
    return seen;
  } catch {
    return false;
  }
}
