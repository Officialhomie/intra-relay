interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/**
 * Temporary content shell for routes that have no feature implementation yet.
 * Replace per-route with real feature UI from `src/features`.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{description ?? "Placeholder page."}</p>
    </section>
  );
}
