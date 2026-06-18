export default null;
declare var self: ServiceWorkerGlobalScope;

const SW_VERSION: string = process?.env?.["SW_VERSION"] || "v1";
const SW_CACHE_NAME: string =
  process?.env?.["SW_CACHE_NAME"] || `cache-${SW_VERSION}`;
// Separate, version-scoped bucket for generated image thumbnails so they
// survive `activate`'s cache sweep (which deletes every other cache) yet still
// get cleared on a SW version bump.
const SW_THUMB_CACHE_NAME: string = `thumbs-${SW_VERSION}`;
const SW_RESOURCES: string[] = JSON.parse(
  process?.env?.["SW_RESOURCES"] || "[]",
);
const RESOURCE_PROTOCOL: string = "/file:/";

// Thumbnail max-width bounds (px). A request for ?thumb=144 yields a webp no
// wider than 144px; clamped so a hostile/garbage value can't ask for a huge
// canvas. Images are never upscaled past their natural width.
const THUMB_MIN_WIDTH = 16;
const THUMB_MAX_WIDTH = 512;

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

  // Image rows can ask for a downscaled thumbnail via `?thumb=<maxWidthPx>`.
  // We decode + resize here in the SW (its own thread) and cache the tiny webp,
  // so the page never decodes multi-megapixel art just to paint a ~36px tile —
  // that full-res decode is what janks the virtualized scroll. SVG is already
  // vector/small, so it's served as-is. On any decode failure we fall through
  // to the original bytes (the row's <img> still works or its onError fires).
  const thumbParam = url.searchParams.get("thumb");
  const isRaster =
    contentType.startsWith("image/") && contentType !== "image/svg+xml";
  if (thumbParam && isRaster) {
    const thumb = await getOrCreateThumbnail(path, file, thumbParam);
    if (thumb) {
      return thumb;
    }
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(contentLength),
    "Accept-Ranges": "bytes",
    "Cache-Control": "max-age=31536000, immutable",
    "Content-Disposition": filename
      ? `attachment; filename="${filename}"`
      : "inline",
  });

  return new Response(file.stream(), { status: 200, headers });
}

/**
 * Return a cached or freshly-generated downscaled webp thumbnail for an image
 * file, or `undefined` if generation fails (caller serves the original).
 *
 * Keyed by the file's STABLE signature — `path` + `lastModified` + `size` + the
 * requested width — NOT the request url. The request url carries a
 * `?v=${Date.now()}` cache-bust that the workspace re-stamps on every load, so
 * keying on it would regenerate every thumbnail on every page load (and leak
 * orphaned cache entries). The signature changes only when the file's bytes
 * actually change, so a real edit still invalidates the thumbnail.
 */
async function getOrCreateThumbnail(
  path: string,
  file: File,
  thumbParam: string,
): Promise<Response | undefined> {
  const maxWidth = Math.max(
    THUMB_MIN_WIDTH,
    Math.min(THUMB_MAX_WIDTH, Math.floor(Number(thumbParam)) || 0),
  );
  if (!Number.isFinite(maxWidth) || maxWidth < THUMB_MIN_WIDTH) {
    return undefined;
  }
  const cacheKey = `${RESOURCE_PROTOCOL}${path}?thumb=${maxWidth}&sig=${file.lastModified}-${file.size}`;
  try {
    const cache = await caches.open(SW_THUMB_CACHE_NAME);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
    // Decode AND downscale in one pass: `resizeWidth` makes the decoder emit a
    // small bitmap directly (preserving aspect) instead of allocating the full
    // multi-megapixel image and scaling it on a canvas afterwards — much less
    // memory + CPU per thumbnail. (Sources narrower than maxWidth upscale
    // slightly, which is harmless at thumbnail size.)
    const bitmap = await createImageBitmap(file, {
      resizeWidth: maxWidth,
      resizeQuality: "low",
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return undefined;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({
      type: "image/webp",
      quality: 0.75,
    });
    const response = new Response(blob, {
      status: 200,
      headers: new Headers({
        "Content-Type": "image/webp",
        "Content-Length": String(blob.size),
        "Cache-Control": "max-age=31536000, immutable",
      }),
    });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return undefined;
  }
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
  { create = false } = {},
) {
  let dir = root;
  for (const seg of splitPath(dirPath))
    dir = await dir.getDirectoryHandle(seg, { create });
  return dir;
}

async function getFileHandleByPath(
  root: FileSystemDirectoryHandle,
  filePath: string,
  { create = false } = {},
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
    })(),
  );
});

self.addEventListener("activate", (e) => {
  const event = e as ExtendableEvent;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== SW_CACHE_NAME && name !== SW_THUMB_CACHE_NAME) {
            return caches.delete(name);
          }
          return false;
        }),
      );
      await self.clients.claim();
    })(),
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
