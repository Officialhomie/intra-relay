"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { isBuyerRoute } from "./buyer-nav";
import { BuyerBottomNav } from "./BuyerBottomNav";
import { BuyerSideRail } from "./BuyerSideRail";
import { useBuyerAttention } from "./useBuyerAttention";

/**
 * The one place that decides whether the persistent buyer nav shows at all
 * (frontend audit D2). Everywhere else — supplier, operator, docs, evidence,
 * the marketing pages — renders exactly as before, nav-free. On buyer routes
 * this wraps the page in a row with the desktop rail, and reserves space at
 * the bottom for the mobile bar so it never covers page content.
 */
export function BuyerNavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNav = isBuyerRoute(pathname);
  const attention = useBuyerAttention(pathname);

  if (!showNav) return <>{children}</>;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <BuyerSideRail pathname={pathname} attention={attention} />
      <div
        className={cn(
          "flex flex-1 flex-col",
          // Clears the fixed mobile bar (BuyerBottomNav's own min-h-14) plus
          // the device safe area, so it never covers page content.
          "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0",
        )}
      >
        {children}
      </div>
      <BuyerBottomNav pathname={pathname} attention={attention} />
    </div>
  );
}
