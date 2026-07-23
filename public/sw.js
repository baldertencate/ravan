const CACHE = "ravan-v10";
const SHELL = [
  "./",
  "./app/",
  "./manifest.webmanifest",
  "./icon-64.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./mastery/sprout.png",
  "./mastery/bud.png",
  "./mastery/bloom.png",
  "./mastery/bouquet.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        const requestPath = new URL(event.request.url).pathname;
        return caches.match(requestPath.includes("/app/") ? "./app/" : "./");
      }),
    ),
  );
});
