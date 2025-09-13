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

async function handleLocalAssetRequest(request: Request, url: URL) {
  // 1) Map URL -> OPFS path and open file
  const opfsPath = url.pathname.replace(RESOURCE_PROTOCOL, "");
  const root = await navigator.storage.getDirectory();
  let fileHandle;
  try {
    fileHandle = await getFileHandleByPath(root, opfsPath, { create: false });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const file = await fileHandle.getFile();
  const size = file.size;
  const type = file.type;

  const lastModifiedHttp = new Date(file.lastModified).toUTCString();
  const etag = `"${size}-${file.lastModified}"`;

  // 2) Common headers
  const baseHeaders = {
    "Content-Type": type,
    "Cache-Control": "no-cache, must-revalidate",
    "Last-Modified": lastModifiedHttp,
    ETag: etag,
    "Accept-Ranges": "bytes",
    Vary: "Origin",
    //"Cross-Origin-Resource-Policy": "cross-origin",
    //"Access-Control-Allow-Origin": SPARKDOWN_PLAYER_ORIGIN,
  };

  // 3) Optional: ETag/Last-Modified for caching
  const inm = request.headers.get("If-None-Match");
  const ims = request.headers.get("If-Modified-Since");
  if (inm === etag || (ims && Date.parse(ims) >= file.lastModified)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  // 4) Options handling
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...baseHeaders,
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers":
          request.headers.get("Access-Control-Request-Headers") || "",
      },
    });
  }

  // 5) HEAD handling
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(size),
      },
    });
  }

  // 6) Range handling
  const range = request.headers.get("Range");
  if (range) {
    // Expect "bytes=start-end"
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (!m)
      return new Response("Malformed Range", {
        status: 416,
        headers: baseHeaders,
      });

    let start = m[1] === "" ? undefined : Number(m[1]);
    let end = m[2] === "" ? undefined : Number(m[2]);

    if (start === undefined && end === undefined) {
      return new Response("Malformed Range", {
        status: 416,
        headers: baseHeaders,
      });
    }

    // If only end is provided: suffix bytes
    if (start === undefined) {
      const suffixLen = Math.min(size, end!);
      start = size - suffixLen;
      end = size - 1;
    } else {
      // If end is omitted, serve to EOF
      if (end === undefined || end >= size) end = size - 1;
    }

    if (start < 0 || start >= size || end < start) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${size}`, // required for 416
        },
      });
    }

    const chunk = file.slice(start, end + 1); // Blob slice never loads the whole file
    return new Response(chunk.stream(), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  // 6) Full-body response (no Range)
  return new Response(file.stream(), {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(size),
    },
  });
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
    event.respondWith(handleLocalAssetRequest(event.request, url));
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
