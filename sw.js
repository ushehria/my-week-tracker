const CACHE = "my-week-shell-v10";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./plan.js",
  "./legacy-plan.js",
  "./london-time.js",
  "./view-date.js",
  "./day-view.js",
  "./page-model.js",
  "./render.js",
  "./store.js",
  "./sync.js",
  "./sync-public.js",
  "./sync-queue.js",
  "./week-summary.js",
  "./activity-rules.js",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const networkRequest = url.pathname.endsWith(".js") ? new Request(request, { cache: "no-store" }) : request;
  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
  );
});
