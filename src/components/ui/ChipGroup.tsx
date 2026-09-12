"use client";

import { cn } from "@/lib/utils";

interface ChipOption {
  value: string;
  label: string;
}

interface ChipGroupProps {
  label: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
}

/** Single-select chip toggle for a small, fixed set of options (paper size, colour) — touch-friendlier than a dropdown at this size. */
export function ChipGroup({ label, options, value, onChange, error, className }: ChipGroupProps) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                active
                  ? "border-primary bg-primary text-primary-contrast"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
