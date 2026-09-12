import Link from "next/link";

import { Mark } from "@/components/brand/Mark";
import { cn } from "@/lib/utils";

import { BUYER_NAV_ITEMS } from "./buyer-nav";

interface BuyerSideRailProps {
  pathname: string;
  attention: number | null;
}

/**
 * Desktop persistent nav (frontend audit D2) — a quiet rail, not a dashboard.
 * Narrower than the content column; content keeps its own max-width rather
 * than stretching into the freed space.
 */
export function BuyerSideRail({ pathname, attention }: BuyerSideRailProps) {
  return (
    <nav
      aria-label="Your Intra navigation"
      className="sticky top-16 hidden w-52 shrink-0 flex-col self-start border-r border-border py-8 pr-4 lg:flex"
    >
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 rounded-sm px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Mark size={22} />
        <span className="text-sm font-semibold tracking-tight">Intra</span>
      </Link>

      <ul className="space-y-1">
        {BUYER_NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const showBadge = item.key === "requests" && Boolean(attention);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                  active
                    ? "bg-surface font-semibold text-foreground"
                    : "font-medium text-subtle hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="flex-1">{item.label}</span>
                {showBadge ? (
                  <span
                    aria-hidden
                    className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-primary-contrast"
                  >
                    {attention}
                  </span>
                ) : null}
                {showBadge ? (
                  <span className="sr-only">, {attention} need your attention</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
