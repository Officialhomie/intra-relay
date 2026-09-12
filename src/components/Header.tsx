import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Mark } from "@/components/brand/Mark";
import { primaryNav, site } from "@/lib/site";

export function Header() {
  return (
    <header className="border-border/90 bg-bg/90 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[var(--container-max)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Mark size={26} className="transition-transform group-hover:scale-110" />
          {site.name}
        </Link>
        <nav aria-label="Primary">
          <ul className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-muted sm:gap-x-5">
            {primaryNav
              .filter((item) => ["/agent", "/supplier/onboard", "/docs"].includes(item.href))
              .map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-sm px-1 py-2 transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        <Link
          href="/supplier/onboard"
          className="hidden min-h-9 items-center gap-1 rounded-sm bg-primary px-3 text-sm font-medium text-primary-contrast transition-transform hover:-translate-y-0.5 sm:inline-flex"
        >
          Join as a business <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
