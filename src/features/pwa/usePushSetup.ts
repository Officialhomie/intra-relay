"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { getSessionId } from "@/lib/session";

/**
 * Browser push setup, kept honest about the four permission states
 * (milestone 7 phase C §5, §8): default / granted / denied / unsupported.
 *
 * Nothing here prompts on its own — a caller decides the moment. A denied
 * permission is never re-prompted (§5). The subscription is always bound to the
 * current recipient server-side; the client only sends the endpoint (§9).
 */

export type PushPermission = "unsupported" | "default" | "granted" | "denied";

interface PushConfig {
  vapidPublicKey: string | null;
  configured: boolean;
  preference: { pushEnabled: boolean; pushInformational: boolean } | null;
}

export interface PushSetup {
  permission: PushPermission;
  /** Server can actually send (VAPID configured) and browser supports it. */
  available: boolean;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  preference: { pushEnabled: boolean; pushInformational: boolean } | null;
  /** Business auth passthrough for the API calls, if any. */
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  setInformational: (on: boolean) => Promise<void>;
}

function urlBase64ToKey(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

function currentPermission(): PushPermission {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unsupported";
  }
  return Notification.permission as PushPermission;
}

export function usePushSetup(options: { authQuery?: string } = {}): PushSetup {
  const suffix = options.authQuery ? `?${options.authQuery}` : "";

  const [permission, setPermission] = useState<PushPermission>("default");
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authArgs = useCallback(
    () => (options.authQuery ? {} : { sessionId: getSessionId() }),
    [options.authQuery],
  );

  useEffect(() => {
    setPermission(currentPermission());
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<PushConfig>(`/api/push/config${suffix}`, authArgs());
        if (!cancelled) setConfig(data);
      } catch {
        /* config is best-effort */
      }
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (!cancelled) setSubscribed(Boolean(sub));
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suffix, authArgs]);

  const available =
    Boolean(config?.configured && config?.vapidPublicKey) && permission !== "unsupported";

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!available || !config?.vapidPublicKey) return false;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToKey(config.vapidPublicKey),
        });
      }
      const json = sub.toJSON();
      await apiRequest(`/api/push/subscribe${suffix}`, {
        method: "POST",
        ...authArgs(),
        body: {
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          userAgent: navigator.userAgent.slice(0, 200),
        },
      });
      setSubscribed(true);
      setConfig((c) =>
        c
          ? {
              ...c,
              preference: {
                pushEnabled: true,
                pushInformational: c.preference?.pushInformational ?? false,
              },
            }
          : c,
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn on notifications.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [available, config?.vapidPublicKey, suffix, authArgs]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest(`/api/push/unsubscribe${suffix}`, {
          method: "POST",
          ...authArgs(),
          body: { endpoint: sub.endpoint },
        }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setSubscribed(false);
      setConfig((c) =>
        c
          ? {
              ...c,
              preference: c.preference ? { ...c.preference, pushEnabled: false } : c.preference,
            }
          : c,
      );
    } finally {
      setBusy(false);
    }
  }, [suffix, authArgs]);

  const setInformational = useCallback(
    async (on: boolean) => {
      try {
        await apiRequest(`/api/notifications/preferences${suffix}`, {
          method: "PATCH",
          ...authArgs(),
          body: { pushInformational: on },
        });
        setConfig((c) =>
          c && c.preference ? { ...c, preference: { ...c.preference, pushInformational: on } } : c,
        );
      } catch {
        /* ignore */
      }
    },
    [suffix, authArgs],
  );

  return {
    permission,
    available,
    subscribed: subscribed && (config?.preference?.pushEnabled ?? true),
    busy,
    error,
    preference: config?.preference ?? null,
    enable,
    disable,
    setInformational,
  };
}
