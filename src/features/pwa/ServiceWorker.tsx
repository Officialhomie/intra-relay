"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

/**
 * Registers the service worker and manages its updates (milestone 7 phase C
 * §2, §25).
 *
 * Registration is deferred to `load` so it never competes with the first
 * useful paint (§37). Updates are surfaced, never forced: a new worker installs
 * and waits; a small banner offers "Update" which activates it and reloads.
 * A person mid-transaction can ignore it and keep working.
 */
export function ServiceWorker() {
  const router = useRouter();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (reg.waiting) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const next = reg.installing;
            if (!next) return;
            next.addEventListener("statechange", () => {
              if (next.state === "installed" && navigator.serviceWorker.controller) {
                setWaiting(next);
              }
            });
          });
        })
        .catch(() => {
          /* SW registration failing must not affect the app (§37). */
        });
    };

    // The SW can ask the page to navigate (its fallback when client.navigate
    // is unavailable) — e.g. a push-notification click.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE" && typeof event.data.href === "string") {
        router.push(event.data.href);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", onLoad);
    };
  }, [router]);

  if (!waiting) return null;

  return (
    <div className="border-b border-border bg-primary-wash px-4 py-2 text-center text-xs text-foreground">
      A new version of Intra is ready.{" "}
      <button
        type="button"
        onClick={() => {
          waiting.postMessage({ type: "SKIP_WAITING" });
          setWaiting(null);
        }}
        className="font-medium text-primary underline underline-offset-2"
      >
        Update now
      </button>
    </div>
  );
}
