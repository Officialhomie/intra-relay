import Link from "next/link";

import { cn } from "@/lib/utils";

import { BUYER_NAV_ITEMS } from "./buyer-nav";

interface BuyerBottomNavProps {
  pathname: string;
  attention: number | null;
}

/**
 * Mobile persistent nav (frontend audit D2). Fixed to the viewport bottom,
 * hidden at `lg:` where the side rail takes over. Active state is never color
 * alone — weight, icon stroke, and `aria-current` all change together.
 */
export function BuyerBottomNav({ pathname, attention }: BuyerBottomNavProps) {
  return (
    <nav
      aria-label="Your Intra navigation"
      className="bg-bg/95 fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-[var(--container-max)]">
        {BUYER_NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const showBadge = item.key === "requests" && Boolean(attention);
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "font-semibold text-foreground" : "font-medium text-subtle",
                )}
              >
                <span className="relative flex">
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.5 : 2} />
                  {showBadge ? (
                    <span
                      aria-hidden
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-primary-contrast"
                    >
                      {attention}
                    </span>
                  ) : null}
                </span>
                <span>
                  {item.label}
                  {showBadge ? (
                    <span className="sr-only">, {attention} need your attention</span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
