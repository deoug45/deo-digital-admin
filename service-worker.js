/* DeoBiz — Service Worker (no icons folder required) */

const CACHE_VERSION = "v4";
const CACHE_NAME = `deo-biz-cache-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/logo.png",
  "/verify.html",
  "/verify.js"
];

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Offline</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#070A0F;color:#EAF2FF}
    .card{width:min(520px,92vw);border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:18px}
    h1{margin:0 0 8px;font-size:18px}
    p{margin:0;color:rgba(234,242,255,.75)}
  </style>
</head>
<body>
  <div class="card">
    <h1>You are offline</h1>
    <p>Please reconnect to continue.</p>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try { await cache.add(url); } catch { /* ignore missing */ }
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k.startsWith("deo-biz-cache-") && k !== CACHE_NAME ? caches.delete(k) : null))
      );
      await self.clients.claim();
    })()
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigations so updates arrive
  if (isNavigationRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(OFFLINE_FALLBACK_HTML, { headers: { "Content-Type": "text/html" } });
        }
      })()
    );
    return;
  }

  // Cache-first for assets
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});