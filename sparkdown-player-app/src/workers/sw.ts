import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { FetchGameAssetMessage } from "../../../packages/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage";
import { filterSVG } from "../../../packages/sparkdown/src/compiler/utils/filterSVG";
import {
  filteredSvgResponse,
  parseImageFilterParam,
  type ImageFilter,
} from "../../../packages/sparkdown/src/filters/filteredSvg";

export {};
declare const self: ServiceWorkerGlobalScope;

const RESOURCE_PROTOCOL: string = "/file:/";

// Generated filtered-SVG variants (#299), keyed by REQUEST URL. URL keying is
// sound here only because asset urls are content-signature-stamped
// (`?v=<mtime>-<size>`, #305): a byte change produces a NEW url, so an old
// entry can never be served for changed content. (This SW can't use the
// editor SW's file-signature keying — it never sees file metadata, only the
// bytes relayed back from the editor page.) Superseded signatures of the same
// path+filters variant are pruned on write.
const SW_FILTERED_CACHE_NAME: string = "filtered-svgs";

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

/** Filtered-variant generations currently running, keyed by request url. */
const inFlightFilteredSvgs: Map<string, Promise<string>> = new Map();

/**
 * Relay the root svg's bytes from the editor, filter them, and cache the
 * variant. Resolves to the filtered SOURCE, so concurrent callers can each
 * build their own Response instead of sharing a tee'd body.
 */
async function generateFilteredSvg(
  url: URL,
  path: string,
  clientId: string,
  filter: ImageFilter,
  filtersParam: string,
): Promise<string> {
  const client = await self.clients.get(clientId);
  if (!client) {
    throw new Error(`no client ${clientId}`);
  }
  const { transfer } = await sendRequest(client, FetchGameAssetMessage.type, {
    path,
  });
  const filtered = filterSVG(new TextDecoder().decode(transfer[0]), filter);
  try {
    const cache = await caches.open(SW_FILTERED_CACHE_NAME);
    await cache.put(url.href, filteredSvgResponse(filtered));
    // Prune superseded signatures of this exact variant AFTER responding: same
    // path + same filters at a DIFFERENT url means the file's `?v=` signature
    // moved (an edit), so the old entry can never be requested again. Kept off
    // the critical path because `cache.keys()` enumerates the whole bucket, and
    // warming a project's whole variant set would make that O(n^2) on the
    // thread serving the image the user is waiting for.
    void (async () => {
      try {
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => {
              const cachedUrl = new URL(req.url);
              return (
                cachedUrl.pathname === url.pathname &&
                cachedUrl.searchParams.get("filters") === filtersParam &&
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

  // On-demand filtered SVG variants (#299): the round-trip only relays the
  // PATH to the editor, so the filters param must be honored here or
  // filtered_src URLs silently render unfiltered.
  const filtersParam = url.searchParams.get("filters");
  const filter =
    filtersParam && contentType === "image/svg+xml"
      ? parseImageFilterParam(filtersParam)
      : undefined;

  // Serve a previously generated variant WITHOUT paying the SW -> page ->
  // editor relay round-trip or re-running filterSVG (see the cache-name
  // comment for why URL keying is sound).
  if (filter) {
    try {
      const cache = await caches.open(SW_FILTERED_CACHE_NAME);
      const cached = await cache.match(url.href);
      if (cached) {
        return cached;
      }
    } catch {}
    // Showing an image asks for the variant TWICE at once — `createImage`
    // writes the url as `background-image` and as a hidden <img>'s src — and a
    // preload can race both. Nothing is cached until the first finishes, so
    // without this every one of them pays the relay AND filterSVG again
    // (#344). Sharing is best-effort: a failed generation falls through to the
    // unfiltered relay below rather than failing every caller at once.
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
        filtersParam!,
      );
      inFlightFilteredSvgs.set(url.href, generation);
      try {
        return filteredSvgResponse(await generation);
      } finally {
        // Only if it is still ours — see the shared generator's note.
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
