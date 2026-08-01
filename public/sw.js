const CACHE_PREFIX = "ravan-";
const CACHE = `${CACHE_PREFIX}v41`;
const LANDING_PAGE = "./";
const APP_PAGE = "./app/";
const SHELL = [
  LANDING_PAGE,
  APP_PAGE,
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

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);

  // The generated asset names change with every deployment. Cache the exact
  // scripts and styles referenced by this release so the app also starts offline.
  const assetUrls = new Set();
  for (const page of [LANDING_PAGE, APP_PAGE]) {
    const response = await cache.match(page);
    if (!response) continue;
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], new URL(page, self.location.href));
      if (url.origin === self.location.origin && url.pathname.includes("/assets/")) {
        assetUrls.add(url.href);
      }
    }
  }

  await cache.addAll([...assetUrls]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function fallbackPageFor(requestUrl) {
  const isAppPage = requestUrl.pathname.endsWith("/app") || requestUrl.pathname.includes("/app/");
  return isAppPage ? APP_PAGE : LANDING_PAGE;
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  const fallbackPage = fallbackPageFor(new URL(request.url));

  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Page request failed with ${response.status}`);
    try {
      await cache.put(fallbackPage, response.clone());
    } catch {
      // A full cache should not prevent a successful online navigation.
    }
    return response;
  } catch {
    return (
      (await cache.match(fallbackPage)) ||
      new Response("Ravân is unavailable offline until it has been opened once online.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    } catch {
      // A full cache should not prevent a successful online asset request.
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  // Static requests never fall back to HTML. Returning HTML for a missing
  // script or stylesheet prevents the app from starting and causes a blank page.
  event.respondWith(cacheFirstAsset(event.request));
});
