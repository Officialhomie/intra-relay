"use client";

/**
 * The hook every client surface uses to record product events (M9.5).
 *
 * It never returns anything that can throw: the underlying adapter swallows
 * failures, and when analytics is disabled these are all no-ops. `track`
 * auto-attaches the caller's `role` and the current `platform` so individual
 * call sites stay a single line.
 */

import { useCallback, useMemo } from "react";

import {
  identifyUser as adapterIdentify,
  resetIdentity as adapterReset,
  track as adapterTrack,
} from "./client";
import type { AnalyticsEventMap, AnalyticsEventName, AnalyticsRole } from "./events";
import { businessIdentity, buyerIdentity, detectPlatform } from "./identity";

export interface AnalyticsApi {
  track: <K extends AnalyticsEventName>(name: K, props: AnalyticsEventMap[K]) => void;
  identifyBuyer: (sessionId: string | null | undefined) => void;
  identifyBusiness: (businessId: string | null | undefined) => void;
  reset: () => void;
}

export function useAnalytics(role: AnalyticsRole = "buyer"): AnalyticsApi {
  const base = useMemo(() => ({ role, platform: detectPlatform() }), [role]);

  const track = useCallback<AnalyticsApi["track"]>(
    (name, props) => {
      adapterTrack(name, props, base);
    },
    [base],
  );

  const identifyBuyer = useCallback((sessionId: string | null | undefined) => {
    adapterIdentify(buyerIdentity(sessionId));
  }, []);

  const identifyBusiness = useCallback((businessId: string | null | undefined) => {
    adapterIdentify(businessIdentity(businessId));
  }, []);

  const reset = useCallback(() => {
    adapterReset();
  }, []);

  return useMemo(
    () => ({ track, identifyBuyer, identifyBusiness, reset }),
    [track, identifyBuyer, identifyBusiness, reset],
  );
}
