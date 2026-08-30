"use client";

import { useEffect, useState } from "react";

import { WifiOff } from "lucide-react";

/**
 * Global connectivity notice. When the browser goes offline, actions that hit
 * the API (send a request, activate a route, send a quote) will fail with a
 * clear message — this banner tells the user why before they try.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-wash px-4 py-2 text-center text-xs font-medium text-warning"
    >
      <WifiOff aria-hidden className="size-3.5 shrink-0" />
      You are offline. Intra will keep showing the last loaded page; new requests need a connection.
    </div>
  );
}
