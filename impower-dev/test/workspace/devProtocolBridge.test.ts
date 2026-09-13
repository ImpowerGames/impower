import { afterEach, describe, expect, it, vi } from "vitest";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { createProtocolBridge, installProtocolBridge } from "../../src/modules/spark-editor/workspace/devProtocolBridge";
import { LoadedProjectIdMessage } from "@impower/spark-editor-protocol/src/protocols/window/LoadedProjectIdMessage";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("editor protocol transport", () => {
  it("does not reflect socket notifications but forwards synchronous editor events they cause", async () => {
    const sockets: any[] = [];
    class Socket {
      static OPEN = 1;
      readyState = 1;
      onmessage: any;
      send = vi.fn();
      close() { this.readyState = 3; }
      constructor() { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", Socket);
    const dispose = installProtocolBridge();
    const handle = (event: Event) => {
      if ((event as CustomEvent).detail.method === "doChange") {
        sendProtocolMessage({ jsonrpc: "2.0", method: "changed", params: { actual: true } });
      }
    };
    window.addEventListener("jsonrpc", handle);
    try {
      await sockets[0].onmessage({ data: JSON.stringify({ jsonrpc: "2.0", method: "preview/didChangeGameState", params: { mounted: true } }) });
      await sockets[0].onmessage({ data: JSON.stringify({ jsonrpc: "2.0", method: "doChange", params: {} }) });
      expect(sockets[0].send.mock.calls.map(([data]: [string]) => JSON.parse(data))).toEqual([
        { jsonrpc: "2.0", method: "changed", params: { actual: true } },
      ]);
    } finally { window.removeEventListener("jsonrpc", handle); dispose(); }
  });
  it("reconnects after losing ownership without replaying requests or leaking replies into the new socket", async () => {
    vi.useFakeTimers();
    const sockets: any[] = [];
    class Socket {
      static OPEN = 1;
      readyState = 1;
      onmessage: any;
      onclose: any;
      send = vi.fn();
      close() { this.readyState = 3; this.onclose?.(); }
      constructor() { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", Socket);
    const dispose = installProtocolBridge();
    try {
      const first = sockets[0];
      const pending = first.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: "pending", method: "missing", params: {} }) });
      first.close();
      await vi.advanceTimersByTimeAsync(250);
      expect(sockets).toHaveLength(2);
      sendProtocolMessage({ jsonrpc: "2.0", id: "pending", result: "late" }, window);
      await pending;
      expect(sockets[1].send).not.toHaveBeenCalled();
      sendProtocolMessage({ jsonrpc: "2.0", method: "changed", params: {} });
      expect(sockets[1].send).toHaveBeenCalledTimes(1);
      sockets[1].close();
      dispose();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sockets).toHaveLength(2);
      expect(window.__editorProtocol).toBeUndefined();
    } finally { dispose(); }
  });
  it("does not detach the caller's buffers when a worker takes ownership", async () => {
    const target = new EventTarget();
    target.addEventListener("jsonrpc", (event) => {
      const message = (event as CustomEvent).detail;
      if (message.method === "write" && message.params) {
        structuredClone(message.params.data, { transfer: [message.params.data] });
        sendProtocolMessage({ jsonrpc: "2.0", id: message.id, result: true }, target);
      }
    });
    const bridge = createProtocolBridge(target);
    const data = new Uint8Array([1, 2, 3]).buffer;
    await expect(bridge.send({ jsonrpc: "2.0", id: "write", method: "write", params: { data } })).resolves.toBe(true);
    expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2, 3]));
    bridge.dispose();
  });
  it("waits for a response instead of resolving with its echoed request", async () => {
    const target = new EventTarget();
    const bridge = createProtocolBridge(target);
    const request = bridge.send({ jsonrpc: "2.0", id: "a", method: "window/loadedProjectId", params: {} });
    const settled = vi.fn();
    void request.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    sendProtocolMessage(LoadedProjectIdMessage.type.response("a", { id: "project" }), target);
    await expect(request).resolves.toEqual({ id: "project" });
    bridge.dispose();
  });
  it("correlates concurrent responses and rejects protocol errors", async () => {
    const target = new EventTarget();
    const bridge = createProtocolBridge(target);
    const a = bridge.send({ jsonrpc: "2.0", id: 1, method: "one", params: {} });
    const b = bridge.send({ jsonrpc: "2.0", id: 2, method: "two", params: {} });
    sendProtocolMessage({ jsonrpc: "2.0", id: 2, result: null }, target);
    sendProtocolMessage({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Unknown method" } }, target);
    await expect(a).rejects.toThrow("Unknown method");
    await expect(b).resolves.toBeNull();
    bridge.dispose();
  });
  it("delivers notifications until unsubscribe and cancels pending work on disposal", async () => {
    const target = new EventTarget();
    const bridge = createProtocolBridge(target);
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);
    sendProtocolMessage({ jsonrpc: "2.0", method: "changed", params: {} }, target);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    sendProtocolMessage({ jsonrpc: "2.0", method: "changed", params: {} }, target);
    expect(listener).toHaveBeenCalledTimes(1);
    const pending = bridge.send({ jsonrpc: "2.0", id: 1, method: "missing", params: {} });
    bridge.dispose();
    await expect(pending).rejects.toThrow("disposed");
  });
  it("times out missing handlers and permits reuse after timeout", async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const bridge = createProtocolBridge(target);
    const message = { jsonrpc: "2.0", id: 1, method: "missing", params: {} };
    const result = expect(bridge.send(message, 10)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10);
    await result;
    const retry = bridge.send(message);
    sendProtocolMessage({ jsonrpc: "2.0", id: 1, result: false }, target);
    await expect(retry).resolves.toBe(false);
    bridge.dispose();
  });
});
