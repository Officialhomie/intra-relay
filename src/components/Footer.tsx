import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-6 text-sm text-muted">
        <p>
          {site.name} &middot; {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
