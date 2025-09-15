export default null;
declare var self: ServiceWorkerGlobalScope;

const SW_VERSION: string = process?.env?.["SW_VERSION"] || "v1";
const SW_CACHE_NAME: string =
  process?.env?.["SW_CACHE_NAME"] || `cache-${SW_VERSION}`;
const SW_RESOURCES: string[] = JSON.parse(
  process?.env?.["SW_RESOURCES"] || "[]"
);
const RESOURCE_PROTOCOL: string = "/file:/";

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

async function handleLocalAssetRequest(url: URL) {
  const path = url.pathname.replace(RESOURCE_PROTOCOL, "");

  const root = await navigator.storage.getDirectory();
  let fileHandle;
  try {
    fileHandle = await getFileHandleByPath(root, path, { create: false });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const file = await fileHandle.getFile();

  const filename = path.split("/").at(-1);
  const contentType = file.type;
  const contentLength = file.size;

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(contentLength),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": filename
      ? `attachment; filename="${filename}"`
      : "inline",
  });

  return new Response(file.stream(), { status: 200, headers });
}

function splitPath(path: string) {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getDirectoryHandleByPath(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  { create = false } = {}
) {
  let dir = root;
  for (const seg of splitPath(dirPath))
    dir = await dir.getDirectoryHandle(seg, { create });
  return dir;
}

async function getFileHandleByPath(
  root: FileSystemDirectoryHandle,
  filePath: string,
  { create = false } = {}
) {
  const parts = splitPath(filePath);
  const name = parts.pop();
  const parent = await getDirectoryHandleByPath(root, parts.join("/"), {
    create,
  });
  return parent.getFileHandle(name!, { create });
}

self.addEventListener("install", (e) => {
  const event = e as ExtendableEvent;
  self.skipWaiting();
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

self.addEventListener("fetch", async (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith(RESOURCE_PROTOCOL)) {
    event.respondWith(handleLocalAssetRequest(url));
    return;
  }
  if (process?.env?.["NODE_ENV"] === "production") {
    if (event.request.mode === "navigate") {
      // Fetching a page route
      event.respondWith(cacheThenNetwork("/"));
      return;
    } else if (RESOURCE_URL_REGEX.test(event.request.url)) {
      // Fetching a resource
      event.respondWith(cacheThenNetwork(event.request.url));
      return;
    }
  }
});
