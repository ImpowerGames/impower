import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

/** One dev-server port names one editor session. No editor means no mutation. */
export function attachDevProtocolSocket(server: Server) {
  // A supported 256 MiB asset occupies about 342 MiB after base64 framing.
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 384 * 1024 * 1024 });
  let editor: WebSocket | undefined;
  const clients = new Set<WebSocket>();
  const pending = new Map<string, { client: WebSocket; id: string | number; timer: ReturnType<typeof setTimeout> }>();
  const send = (socket: WebSocket, value: unknown) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
  };
  const fail = (id: string, message: string) => {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    send(entry.client, { jsonrpc: "2.0", id: entry.id, error: { code: -32000, message } });
  };
  const onUpgrade = (request: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/__editor_protocol") return;
    const address = request.socket.remoteAddress;
    const host = request.headers.host || "";
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    const origin = request.headers.origin;
    const role = url.searchParams.get("role");
    if (!localHost || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address || "") ||
        (origin != null && origin !== `http://${host}`) ||
        (role === "editor" && origin !== `http://${host}`) ||
        !["editor", "client"].includes(role || "")) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      // Keep ownership through CLOSING until the close handler settles its work.
      if (role === "editor" && editor) {
        ws.close(1013, "Another editor owns this session");
        return;
      }
      if (role === "editor") editor = ws;
      else clients.add(ws);
      ws.on("error", () => ws.close());
      ws.on("message", (data) => {
        let message: any;
        try { message = JSON.parse(data.toString()); } catch { ws.close(1007, "Invalid JSON"); return; }
        if (!message || message.jsonrpc !== "2.0") { ws.close(1007, "Expected JSON-RPC 2.0"); return; }
        if (role === "editor") {
          if (typeof message.method === "string" && !("id" in message)) {
            for (const client of clients) send(client, message);
          } else if ("result" in message || "error" in message) {
            const entry = pending.get(message.id);
            if (!entry) return;
            clearTimeout(entry.timer);
            pending.delete(message.id);
            send(entry.client, { ...message, id: entry.id });
          }
          return;
        }
        if (typeof message.method !== "string" || ("id" in message && typeof message.id !== "string" && typeof message.id !== "number")) {
          ws.close(1007, "Expected request or notification"); return;
        }
        if (!editor || editor.readyState !== WebSocket.OPEN) {
          if ("id" in message) send(ws, { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "No editor connected" } });
          else ws.close(1013, "No editor connected");
          return;
        }
        if (!("id" in message)) { send(editor, message); return; }
        if (pending.size >= 256) {
          send(ws, { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Too many pending requests" } }); return;
        }
        const id = randomUUID();
        pending.set(id, { client: ws, id: message.id, timer: setTimeout(() => fail(id, "Editor request timed out"), 30_000) });
        send(editor, { ...message, id });
      });
      ws.on("close", () => {
        clients.delete(ws);
        if (editor === ws) {
          editor = undefined;
          for (const id of pending.keys()) fail(id, "Editor disconnected; request outcome may be unknown");
        } else {
          for (const [id, entry] of pending) if (entry.client === ws) { clearTimeout(entry.timer); pending.delete(id); }
        }
      });
    });
  };
  server.on("upgrade", onUpgrade);
  const dispose = () => {
    server.off("upgrade", onUpgrade);
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  };
  server.once("close", dispose);
  return dispose;
}
