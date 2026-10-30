export default null;
declare var self: ServiceWorkerGlobalScope;

import { getOrCreateFilteredSvg as getOrCreateFilteredSvgShared } from "@impower/sparkdown/src/filters/filteredSvg";
import { parseMorphAssetRequest, serveMorphAsset } from "@impower/sparkdown/src/morph/assetService";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { getOrCreateThumbnail as getOrCreateThumbnailShared } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
import { getStaleCacheNames } from "./swCaches";
import { fileResponse } from "./swRanges";

// workaround(vite): client builds replace ambient `process.env` with `{}`, so `process.env.X` reads fold away; injected tokens avoid it
declare const SW_VERSION_INJECTED: string | undefined;
declare const SW_RESOURCES_INJECTED: string | undefined;
declare const SW_NODE_ENV_INJECTED: string | undefined;
const SW_VERSION: string =
  typeof SW_VERSION_INJECTED !== "undefined" ? SW_VERSION_INJECTED : "v1";
const SW_CACHE_NAME: string = `cache-${SW_VERSION}`;
const SW_THUMB_CACHE_NAME: string = "asset-thumbnails";
const SW_FILTERED_CACHE_NAME: string = "filtered-svgs";
const SW_MORPH_CACHE_NAME: string = "morph-artifacts";
const morphService = new MorphBakeService();
const SW_RESOURCES: string[] = JSON.parse(
  typeof SW_RESOURCES_INJECTED !== "undefined" ? SW_RESOURCES_INJECTED : "[]",
);
const SW_NODE_ENV: string =
  typeof SW_NODE_ENV_INJECTED !== "undefined"
    ? SW_NODE_ENV_INJECTED
    : "development";
const RESOURCE_PROTOCOL: string = "/file:/";

const RESOURCE_URL_REGEX =
  /.*[.](?:css|html|js|mjs|ico|svg|png|ttf|woff|woff2)$/;

const cacheThenNetwork = async (url: string) => {
  const cache = await caches.open(SW_CACHE_NAME);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    return cachedResponse;
  } else {
    return fetch(url);
  }
};

async function handleLocalAssetRequest(request: Request) {
  const url = new URL(request.url);
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

  const thumbParam = url.searchParams.get("thumb");
  const isRaster =
    contentType.startsWith("image/") && contentType !== "image/svg+xml";
  if (thumbParam && isRaster) {
    const thumb = await getOrCreateThumbnail(path, file, thumbParam);
    if (thumb) {
      return thumb;
    }
  }

  const morphRequest = parseMorphAssetRequest(url.searchParams);
  if (morphRequest && contentType === "image/svg+xml") {
    if (morphRequest === "invalid") {
      return new Response("Unreadable morph request", { status: 400 });
    }
    let cache: Cache | undefined;
    try {
      cache = await caches.open(SW_MORPH_CACHE_NAME);
    } catch {
    }
    return serveMorphAsset({
      service: morphService,
      ...(cache
        ? {
            cache: {
              match: (key) => cache.match(key),
              put: (key, response) => cache.put(key, response),
              delete: (key) => cache.delete(key),
              keys: () => cache.keys(),
            },
          }
        : {}),
      path,
      file,
      request: morphRequest,
      keyPrefix: RESOURCE_PROTOCOL,
    });
  }

  const filtersParam = url.searchParams.get("attributes");
  if (filtersParam && contentType === "image/svg+xml") {
    const filtered = await getOrCreateFilteredSvg(path, file, filtersParam);
    if (filtered) {
      return filtered;
    }
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "max-age=31536000, immutable",
    "Content-Disposition": filename
      ? `attachment; filename="${filename}"`
      : "inline",
  });

  return fileResponse(file, request.headers.get("Range"), headers);
}

async function getOrCreateThumbnail(
  path: string,
  file: File,
  thumbParam: string,
): Promise<Response | undefined> {
  try {
    const cache = await caches.open(SW_THUMB_CACHE_NAME);
    return await getOrCreateThumbnailShared(
      cache,
      path,
      file,
      thumbParam,
      RESOURCE_PROTOCOL,
    );
  } catch {
    return undefined;
  }
}

async function getOrCreateFilteredSvg(
  path: string,
  file: File,
  filtersParam: string,
): Promise<Response | undefined> {
  try {
    const cache = await caches.open(SW_FILTERED_CACHE_NAME);
    return await getOrCreateFilteredSvgShared(
      {
        match: (key) => cache.match(key),
        put: (key, response) => cache.put(key, response),
        delete: (key) => cache.delete(key),
        keys: () => cache.keys(),
      },
      path,
      file,
      filtersParam,
      RESOURCE_PROTOCOL,
    );
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
        getStaleCacheNames(names, [
          SW_CACHE_NAME,
          SW_THUMB_CACHE_NAME,
          SW_FILTERED_CACHE_NAME,
          SW_MORPH_CACHE_NAME,
        ]).map(
          (name) => caches.delete(name),
        ),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", async (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith(RESOURCE_PROTOCOL)) {
    event.respondWith(handleLocalAssetRequest(event.request));
    return;
  }
  if (SW_NODE_ENV === "production") {
    if (event.request.mode === "navigate") {
      event.respondWith(cacheThenNetwork("/"));
      return;
    } else if (RESOURCE_URL_REGEX.test(event.request.url)) {
      event.respondWith(cacheThenNetwork(event.request.url));
      return;
    }
  }
});
