"use client";

import { useEffect, useState } from "react";

import { Share, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/Button";

import { pilotPing } from "./pilot-ping";

/**
 * The contextual "add to home screen" nudge (milestone 7 phase C §4).
 *
 * Never on first load. A surface renders this only once the person has real
 * asynchronous work — installation is about continuity, so it earns its place
 * once there is something to come back to. Dismissible and remembered.
 * iOS Safari gives no install event, so it gets a one-line Share-sheet hint.
 */

const DISMISS_KEY = "intra.installPromptDismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalone());
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => {
      pilotPing("pwa_install_accepted");
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const iosHint = isIosSafari() && !standalone && !dismissed;
  const canInstall = Boolean(deferred) && !standalone && !dismissed;
  if (!canInstall && !iosHint) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    pilotPing("pwa_install_prompted");
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") pilotPing("pwa_install_accepted");
    setDeferred(null);
    dismiss();
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm">
      <Smartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-foreground">
          Add Intra to your home screen so we can let you know when something needs your attention,
          even when the app is closed.
        </p>
        {canInstall ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void install()}>
              Add to home screen
            </Button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-9 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
            >
              Not now
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            Tap <Share aria-hidden className="size-3.5" /> then &ldquo;Add to Home Screen&rdquo;.
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="shrink-0 text-muted hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
