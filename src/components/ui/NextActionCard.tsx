import type { ReactNode } from "react";

interface NextActionCardProps {
  eyebrow: string;
  headline: string;
  description: string;
  children: ReactNode;
}

/**
 * The single dominant focal action on a workflow page — the visual answer to
 * "what do I need to do now?" (frontend audit D1). One per page. Its content
 * is always an existing, reused panel; this only supplies the spotlight
 * framing, never new business logic.
 */
export function NextActionCard({ eyebrow, headline, description, children }: NextActionCardProps) {
  return (
    <section className="bg-primary-wash/30 space-y-4 rounded-lg border-2 border-primary p-5 sm:p-6">
      <div className="space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="text-xl font-medium tracking-tight text-foreground">{headline}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
