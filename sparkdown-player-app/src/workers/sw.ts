import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { FetchGameAssetMessage } from "../../../packages/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage";
import { normalizeSVGAttributeNames } from "../../../packages/sparkdown/src/attributes/normalizeSVGAttributeNames";
import { filterSVG } from "../../../packages/sparkdown/src/compiler/utils/filterSVG";
import {
  filteredSvgResponse,
  parseImageFilterParam,
  type ImageFilter,
} from "../../../packages/sparkdown/src/filters/filteredSvg";

export {};
declare const self: ServiceWorkerGlobalScope;

const RESOURCE_PROTOCOL: string = "/file:/";

const SW_FILTERED_CACHE_NAME: string = "filtered-svgs-attributes-v3";

const _listeners: Set<(message: any) => void> = new Set();

async function sendRequest<M extends string, P, R>(
  client: Client,
  type: MessageProtocolRequestType<M, P, R>,
  params: P,
  transfer?: Transferable[],
): Promise<R> {
  const request = type.request(params);
  return new Promise<R>((resolve, reject) => {
    const onResponse = (message: any) => {
      if (message) {
        if (message.method === request.method && message.id === request.id) {
          if (message.error !== undefined) {
            reject({ data: message.method, ...message.error });
            _listeners.delete(onResponse);
          } else if (message.result !== undefined) {
            resolve(message.result);
            _listeners.delete(onResponse);
          }
        }
      }
    };
    _listeners.add(onResponse);
    client.postMessage(request, transfer ? { transfer } : undefined);
  });
}

const inFlightFilteredSvgs: Map<string, Promise<string>> = new Map();

async function generateFilteredSvg(
  url: URL,
  path: string,
  clientId: string,
  filter: ImageFilter,
  attributesParam: string,
): Promise<string> {
  const client = await self.clients.get(clientId);
  if (!client) {
    throw new Error(`no client ${clientId}`);
  }
  const { transfer } = await sendRequest(client, FetchGameAssetMessage.type, {
    path,
  });
  const buffer = transfer[0];
  if (!buffer) throw new Error("Asset relay returned no bytes");
  const filtered = filterSVG(normalizeSVGAttributeNames(new TextDecoder().decode(buffer)), filter);
  try {
    const cache = await caches.open(SW_FILTERED_CACHE_NAME);
    await cache.put(url.href, filteredSvgResponse(filtered));
    void (async () => {
      try {
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => {
              const cachedUrl = new URL(req.url);
              return (
                cachedUrl.pathname === url.pathname &&
                cachedUrl.searchParams.get("attributes") === attributesParam &&
                req.url !== url.href
              );
            })
            .map((req) => cache.delete(req)),
        );
      } catch {}
    })();
  } catch {}
  return filtered;
}

async function handleLocalAssetRequest(url: URL, clientId: string) {
  const path = url.pathname.replace(RESOURCE_PROTOCOL, "");
  const filename = path.split("/").at(-1);
  const contentType = guessType(filename || "");

  const attributesParam = url.searchParams.get("attributes");
  const filter =
    attributesParam && contentType === "image/svg+xml"
      ? parseImageFilterParam(attributesParam)
      : undefined;

  if (filter) {
    try {
      const cache = await caches.open(SW_FILTERED_CACHE_NAME);
      const cached = await cache.match(url.href);
      if (cached) {
        return cached;
      }
    } catch {}
    const shared = inFlightFilteredSvgs.get(url.href);
    if (shared) {
      try {
        return filteredSvgResponse(await shared);
      } catch {}
    }
  }

  try {
    if (filter) {
      const generation = generateFilteredSvg(
        url,
        path,
        clientId,
        filter,
        attributesParam!,
      );
      inFlightFilteredSvgs.set(url.href, generation);
      try {
        return filteredSvgResponse(await generation);
      } finally {
        if (inFlightFilteredSvgs.get(url.href) === generation) {
          inFlightFilteredSvgs.delete(url.href);
        }
      }
    }

    const client = await self.clients.get(clientId);
    if (client) {
      const { transfer } = await sendRequest(
        client,
        FetchGameAssetMessage.type,
        {
          path,
        },
      );
      const buffer = transfer[0];
      if (!buffer) throw new Error("Asset relay returned no bytes");

      const contentLength = buffer.byteLength;
      const headers = new Headers({
        "Content-Type": contentType,
        "Content-Length": String(contentLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "max-age=31536000, immutable",
        "Content-Disposition": filename
          ? `attachment; filename="${filename}"`
          : "inline",
      });
      return new Response(buffer, { status: 200, headers });
    }
  } catch {}
  return new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

self.addEventListener("message", (event) => {
  const message = event.data;
  for (const listener of _listeners) {
    listener(message);
  }
});

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") {
    return;
  }
  if (url.pathname.startsWith(RESOURCE_PROTOCOL)) {
    const clientId = event.clientId;
    event.respondWith(handleLocalAssetRequest(url, clientId));
  }
});

function guessType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "json":
      return "application/json";
    case "txt":
      return "text/plain; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "js":
      return "text/javascript; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
