import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="bg-surface-accent/45 mt-10 border-t border-border">
      <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-medium text-foreground">
          {site.name} &middot; {new Date().getFullYear()}
        </p>
        <p>Real businesses. Clear quotes. You stay in control.</p>
      </div>
    </footer>
  );
}
