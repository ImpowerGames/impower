import { FetchGameAssetMessage } from "../../../packages/spark-editor-protocol/src/protocols/game/FetchGameAssetMessage";
import type { MessageProtocolRequestType } from "../../../packages/spark-editor-protocol/src/protocols/MessageProtocolRequestType";

export {};
declare const self: ServiceWorkerGlobalScope;

const RESOURCE_PROTOCOL: string = "/file:/";

const _listeners: Set<(message: any) => void> = new Set();

async function sendRequest<M extends string, P, R>(
  client: Client,
  type: MessageProtocolRequestType<M, P, R>,
  params: P,
  transfer?: Transferable[]
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

async function handleLocalAssetRequest(url: URL, clientId: string) {
  const path = url.pathname.replace(RESOURCE_PROTOCOL, "");
  try {
    const client = await self.clients.get(clientId);
    if (client) {
      const { transfer } = await sendRequest(
        client,
        FetchGameAssetMessage.type,
        {
          path,
        }
      );
      const buffer = transfer[0];
      const filename = path.split("/").at(-1);
      const contentType = guessType(filename || "");
      const contentLength = buffer.byteLength;
      const headers = new Headers({
        "Content-Type": contentType,
        "Content-Length": String(contentLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
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

self.addEventListener("install", (e) => self.skipWaiting());

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
