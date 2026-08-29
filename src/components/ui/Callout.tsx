import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type CalloutTone = "info" | "warning" | "success";

const toneConfig: Record<CalloutTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "border-border bg-surface text-foreground" },
  warning: {
    icon: AlertTriangle,
    className:
      "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  const { icon: Icon, className: toneClassName } = toneConfig[tone];
  return (
    <div className={cn("flex gap-3 rounded-md border p-3 text-sm", toneClassName, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
