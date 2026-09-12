import { Bell, ClipboardList, Home, type LucideIcon } from "lucide-react";

/**
 * The buyer's persistent app-level navigation — one definition shared by the
 * mobile bottom bar and the desktop side rail (frontend audit D2). Contextual,
 * in-workflow links (e.g. "Start a new request" inside an exception) are a
 * separate concern and stay where they are.
 */
export interface BuyerNavItem {
  key: "home" | "activity" | "requests";
  label: string;
  href: string;
  icon: LucideIcon;
  /** Whether this item is the active one for a given pathname. */
  isActive: (pathname: string) => boolean;
}

export const BUYER_NAV_ITEMS: readonly BuyerNavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/agent",
    icon: Home,
    isActive: (pathname) => pathname === "/agent",
  },
  {
    key: "activity",
    label: "Activity",
    href: "/activity",
    icon: Bell,
    isActive: (pathname) => pathname === "/activity",
  },
  {
    key: "requests",
    label: "Requests",
    href: "/requests",
    icon: ClipboardList,
    // A task detail page is reached by drilling into a request, so it counts
    // as part of this destination too — otherwise nothing would be marked
    // active while looking at one specific request.
    isActive: (pathname) => pathname === "/requests" || pathname.startsWith("/tasks/"),
  },
];

const BUYER_ROUTE_EXACT = new Set(["/agent", "/activity", "/requests"]);

/** True on any route the persistent buyer nav should appear on. */
export function isBuyerRoute(pathname: string): boolean {
  return BUYER_ROUTE_EXACT.has(pathname) || pathname.startsWith("/tasks/");
}
