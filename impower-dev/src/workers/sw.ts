export default null;
declare var self: ServiceWorkerGlobalScope;

const SW_VERSION: string = process?.env?.["SW_VERSION"] || "v1";
const SW_CACHE_NAME: string =
  process?.env?.["SW_CACHE_NAME"] || `cache-${SW_VERSION}`;
const SW_RESOURCES: string[] = JSON.parse(
  process?.env?.["SW_RESOURCES"] || "[]"
);

const RESOURCE_URL_REGEX = /.*(?:css|html|js|mjs|ico|svg|png|ttf|woff|woff2)$/;

self.addEventListener("install", (e) => {
  const event = e as ExtendableEvent;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SW_CACHE_NAME);
      cache.addAll(SW_RESOURCES);
    })()
  );
});

self.addEventListener("activate", (e) => {
  const event = e as ExtendableEvent;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== SW_CACHE_NAME) {
            return caches.delete(name);
          }
          return false;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    // when seeking an HTML page
    event.respondWith(
      (async () => {
        const response = await caches.match("/");
        if (response) {
          // Return the cached page if it's available.
          return response;
        } else {
          // Fallback to latest
          return fetch(event.request.url);
        }
      })()
    );
  } else if (RESOURCE_URL_REGEX.test(event.request.url)) {
    // Seeking resource
    event.respondWith(
      (async () => {
        const cache = await caches.open(SW_CACHE_NAME);
        const cachedResponse = await cache.match(event.request.url);
        if (cachedResponse) {
          // Return the cached resource if it's available.
          return cachedResponse;
        } else {
          // Fallback to latest
          return fetch(event.request.url);
        }
      })()
    );
  }
});
