export default null;
declare var self: ServiceWorkerGlobalScope;

const SW_VERSION: string = process?.env?.["SW_VERSION"] || "v1";
const SW_CACHE_NAME: string =
  process?.env?.["SW_CACHE_NAME"] || `cache-${SW_VERSION}`;
const SW_RESOURCES: string[] = JSON.parse(
  process?.env?.["SW_RESOURCES"] || "[]"
);

const GREEN = "\x1b[32m%s\x1b[0m";

const RESOURCE_URL_REGEX =
  /.*[.](?:css|html|js|mjs|ico|svg|png|ttf|woff|woff2)$/;

const cacheThenNetwork = async (url: string) => {
  const cache = await caches.open(SW_CACHE_NAME);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    // Fetch from cache if exists.
    return cachedResponse;
  } else {
    // Fallback to network
    return fetch(url);
  }
};

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
  //console.log(GREEN, "FETCH", event.request.mode, event.request.url);
  if (process?.env?.["NODE_ENV"] === "production") {
    if (event.request.mode === "navigate") {
      // Fetching a page route
      event.respondWith(cacheThenNetwork("/"));
    } else if (RESOURCE_URL_REGEX.test(event.request.url)) {
      // Fetching a resource
      event.respondWith(cacheThenNetwork(event.request.url));
    }
  }
});
