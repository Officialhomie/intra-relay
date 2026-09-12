"use client";

import { useId, useState, type ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/** Collapsible detail section — progressive disclosure for record detail the user can already infer or doesn't need up front. */
export function Disclosure({ summary, children, defaultOpen = true, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={cn("rounded-md border border-border bg-surface", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {summary}
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div id={contentId} className="border-t border-border p-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
