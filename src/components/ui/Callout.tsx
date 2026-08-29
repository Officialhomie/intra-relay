import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type CalloutTone = "info" | "warning" | "success" | "unavailable";

const toneConfig: Record<CalloutTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "border-mist/60 bg-info-wash text-info" },
  warning: { icon: AlertTriangle, className: "border-warning/25 bg-warning-wash text-warning" },
  success: { icon: CheckCircle2, className: "border-success/20 bg-success-wash text-success" },
  unavailable: { icon: CircleSlash, className: "border-border-strong bg-surface text-muted" },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  const { icon: Icon, className: toneClassName } = toneConfig[tone];
  return (
    <div className={cn("flex gap-3 rounded-md border p-4 text-sm", toneClassName, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
