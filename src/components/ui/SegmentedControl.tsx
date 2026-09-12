"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

/** Single-select tab strip for switching between views of the same data — not page navigation. */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex rounded-md border border-border bg-bg p-1", className)}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "min-h-9 flex-1 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              active ? "bg-surface text-foreground shadow-sm" : "text-subtle hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
