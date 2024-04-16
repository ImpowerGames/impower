export default null;
declare var self: ServiceWorkerGlobalScope;

const SW_VERSION: string = process?.env?.["SW_VERSION"] || "v1";
const SW_CACHE_NAME: string =
  process?.env?.["SW_CACHE_NAME"] || `cache-${SW_VERSION}`;
const SW_RESOURCES: string[] = JSON.parse(
  process?.env?.["SW_RESOURCES"] || "[]"
);

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
  // when seeking an HTML page
  if (event.request.mode === "navigate") {
    // Return to the index.html page
    const response = caches.match("/");
    if (response) {
      event.respondWith(response as Promise<Response>);
    }
    return;
  }
  // For every other request type
  event.respondWith(
    (async () => {
      const cache = await caches.open(SW_CACHE_NAME);
      const cachedResponse = await cache.match(event.request.url);
      if (cachedResponse) {
        // Return the cached response if it's available.
        return cachedResponse;
      }
      // Respond with a HTTP 404 response status.
      return new Response(null, { status: 404 });
    })()
  );
});
