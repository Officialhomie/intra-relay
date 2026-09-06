/*
 * Intra service worker (milestone 7 phase C §3, §10, §12, §25).
 *
 * CACHE POLICY — server state is always authoritative:
 *   /api/*                     network-only. Never cached. Offline → a clean
 *                              JSON error so the app shows "you're offline",
 *                              never a false success.
 *   /_next/static/*, /icons/*  cache-first (content-hashed / immutable).
 *   navigations (HTML)         network-first; offline → the cached shell.
 *   other GET                  network-first, fall back to cache.
 *
 * Nothing about prices, quotes, approval, payment, fulfilment, cancellation,
 * handover or permissions is ever served from cache.
 *
 * UPDATE POLICY (§25): a new worker installs and waits. It only takes over when
 * the page sends { type: "SKIP_WAITING" } — the page does that when the user is
 * not mid-transaction — then reloads. No forced refresh.
 */

const VERSION = "v1";
const SHELL_CACHE = `intra-shell-${VERSION}`;
const ASSET_CACHE = `intra-assets-${VERSION}`;
const SHELL_URLS = ["/offline", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
  // Deliberately NOT skipWaiting() — see UPDATE POLICY.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match("/offline")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private / dynamic API — never cached, never faked.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: "OFFLINE", message: "You're offline." },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r || Response.error())),
  );
});

/* ---- Web push (§10, §11) ------------------------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {
    title: "Intra",
    body: "Something needs your attention.",
    url: "/activity",
    tag: "intra",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_e) {
    /* keep the safe default */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || "intra",
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/activity" },
    }),
  );
});

/* ---- Notification click → open/focus → the exact workflow (§12) --------- */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/activity";
  const target = new URL(raw, self.location.origin);
  // A marker so the landing page can record "workflow resumed from a push".
  target.searchParams.set("ref", "push");
  const href = target.pathname + target.search;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(href);
            } catch (_e) {
              client.postMessage({ type: "NAVIGATE", href });
            }
          } else {
            client.postMessage({ type: "NAVIGATE", href });
          }
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
