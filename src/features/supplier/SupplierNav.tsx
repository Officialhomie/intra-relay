import Link from "next/link";

import { cn } from "@/lib/utils";

type SupplierNavItem = "overview" | "requests" | "review";

const ITEMS: { id: SupplierNavItem; label: string; path: string }[] = [
  { id: "overview", label: "Overview", path: "" },
  { id: "requests", label: "Requests", path: "/requests" },
  { id: "review", label: "Review", path: "/review" },
];

/**
 * Shared segmented nav across the three business-workspace pages. Plain
 * `Link`s styled like a `SegmentedControl` — each page is its own route, not
 * client-side tab state, so this stays server-renderable.
 */
export function SupplierNav({
  slug,
  active,
  manageToken,
}: {
  slug: string;
  active: SupplierNavItem;
  manageToken?: string;
}) {
  const suffix = manageToken ? `?t=${manageToken}` : "";
  return (
    <nav
      aria-label="Business workspace sections"
      className="flex rounded-md border border-border bg-bg p-1"
    >
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={`/supplier/${slug}${item.path}${suffix}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "min-h-9 flex-1 rounded-sm px-3 py-1.5 text-center text-sm font-medium transition-colors",
              isActive
                ? "bg-surface text-foreground shadow-sm"
                : "text-subtle hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
