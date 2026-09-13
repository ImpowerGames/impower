import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import { parseProtocolJSON, stringifyProtocolJSON } from "@impower/spark-editor-protocol/src/utils/protocolJSON";

export interface ProtocolBridge {
  send(message: Message, timeoutMs?: number): Promise<unknown>;
  subscribe(listener: (message: Message) => void): () => void;
}

/** Transport only: handlers and message vocabulary belong to the editor. */
export function createProtocolBridge(target: EventTarget): ProtocolBridge & { dispose(): void } {
  const pending = new Map<string | number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const subscribers = new Set<(message: Message) => void>();
  const injectedNotifications = new WeakSet<object>();
  let disposed = false;
  const receive = (event: Event) => {
    const message = (event as CustomEvent).detail;
    if (!message || message.jsonrpc !== "2.0") return;
    // A request echoes on the same bus. Only responses can settle a request.
    if ("result" in message || "error" in message) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(Object.assign(new Error(message.error.message), message.error));
      else request.resolve(message.result);
    } else if (typeof message.method === "string" && !("id" in message)) {
      // Suppress only our injected object, never a derived editor event that
      // a handler publishes synchronously while processing that notification.
      if (injectedNotifications.has(message)) return;
      for (const subscriber of subscribers) subscriber(message);
    }
  };
  target.addEventListener(MessageProtocol.event, receive);
  return {
    send(message, timeoutMs = 30_000) {
      if (disposed) return Promise.reject(new Error("Protocol bridge disposed"));
      if (!message || message.jsonrpc !== "2.0" || !("method" in message) || typeof message.method !== "string" || "result" in message || "error" in message) {
        return Promise.reject(new Error("Expected a JSON-RPC request or notification"));
      }
      if (!("id" in message)) {
        const outgoing = structuredClone(message);
        injectedNotifications.add(outgoing);
        sendProtocolMessage(outgoing, target);
        return Promise.resolve(undefined);
      }
      const id = message.id;
      if ((typeof id !== "string" && typeof id !== "number") || pending.has(id)) return Promise.reject(new Error("Invalid or duplicate request id"));
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error("Expected a positive timeout"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Protocol request timed out: ${message.method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { sendProtocolMessage(structuredClone(message), target); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    subscribe(listener) {
      if (disposed) throw new Error("Protocol bridge disposed");
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    dispose() {
      disposed = true;
      target.removeEventListener(MessageProtocol.event, receive);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Protocol bridge disposed"));
      }
      pending.clear();
      subscribers.clear();
    },
  };
}

declare global {
  interface Window { __editorProtocol?: ProtocolBridge }
}

export function installProtocolBridge() {
  const bridge = createProtocolBridge(window);
  window.__editorProtocol = bridge;
  let socket: WebSocket;
  let disposed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 250;
  const unsubscribe = bridge.subscribe((message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(stringifyProtocolJSON(message));
  });
  const connect = () => {
    if (disposed) return;
    const connection = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/__editor_protocol?role=editor`);
    socket = connection;
    connection.onclose = () => {
      if (disposed) return;
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 5000);
    };
    connection.onmessage = async (event) => {
      delay = 250;
      let message: any;
      try {
        message = parseProtocolJSON(event.data);
        const result = await bridge.send(message);
        if ("id" in message && connection.readyState === WebSocket.OPEN) {
          connection.send(stringifyProtocolJSON({ jsonrpc: "2.0", id: message.id, result: result ?? null }));
        }
      } catch (error) {
        if (message && "id" in message && connection.readyState === WebSocket.OPEN) {
          connection.send(stringifyProtocolJSON({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: String(error) } }));
        }
      }
    };
  };
  connect();
  return () => {
    disposed = true;
    clearTimeout(retry);
    unsubscribe();
    socket.close();
    bridge.dispose();
    if (window.__editorProtocol === bridge) delete window.__editorProtocol;
  };
}
