"use client";

/**
 * Initialises analytics once per page load, after the app is mounted so the
 * SDK sees real identity + page context (brief §3), then records `app_opened`.
 *
 * Mounted once in the root layout. Role is derived from the path:
 *   /supplier/*  -> business    /operator/*  -> operator (not identified)   else -> buyer
 *
 * The buyer session id is the identity through-line (brief §7); business pages
 * additionally call `identifyBusiness` from `AnalyticsBusinessIdentity` once the
 * server has resolved the business id.
 */

import { useEffect } from "react";

import { usePathname } from "next/navigation";

import { getSessionId } from "@/lib/session";

import { identifyUser, initAnalytics, track } from "./client";
import { readBrowserAnalyticsConfig } from "./config";
import type { AnalyticsRole } from "./events";
import {
  buyerIdentity,
  detectPlatform,
  isTestViewer,
  markAppOpenedAndWasReturning,
} from "./identity";

function roleFromPath(pathname: string | null): AnalyticsRole {
  if (!pathname) return "buyer";
  if (pathname.startsWith("/supplier")) return "business";
  if (pathname.startsWith("/operator")) return "operator";
  return "buyer";
}

export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const role = roleFromPath(pathname);
    initAnalytics(readBrowserAnalyticsConfig(), { isTest: isTestViewer() });

    // Operators are never identified into product analytics (brief §5).
    if (role === "operator") return;

    if (role === "buyer") {
      identifyUser(buyerIdentity(getSessionId()));
    }

    const platform = detectPlatform();
    track(
      "app_opened",
      {
        role,
        platform,
        pwa_installed: platform === "installed_pwa",
        returning: markAppOpenedAndWasReturning(),
      },
      { role },
    );
    // Once per load — the root layout does not remount on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
