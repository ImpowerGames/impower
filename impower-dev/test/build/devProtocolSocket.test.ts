// @vitest-environment node
import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { attachDevProtocolSocket } from "../../src/build/devProtocolSocket";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); vi.restoreAllMocks(); });
async function host() {
  const server = createServer();
  const dispose = attachDevProtocolSocket(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const origin = `http://127.0.0.1:${address.port}`;
  cleanup.push(() => { dispose(); server.close(); });
  const connect = async (role: string, received?: any[]) => {
    const socket = new WebSocket(`${origin.replace("http:", "ws:")}/__editor_protocol?role=${role}`, role === "editor" ? { origin } : {});
    cleanup.push(() => socket.terminate());
    socket.on("message", data => received?.push(JSON.parse(data.toString())));
    await once(socket, "open");
    return socket;
  };
  return { origin, connect };
}
const read = (socket: WebSocket) => once(socket, "message").then(([data]) => JSON.parse(data.toString()));
it("retains a closing owner until its pending requests have been failed", async () => {
  const accepted: WebSocket[] = [];
  const upgrade = WebSocketServer.prototype.handleUpgrade;
  vi.spyOn(WebSocketServer.prototype, "handleUpgrade").mockImplementation(function(request, socket, head, callback) {
    upgrade.call(this, request, socket, head, (ws, request) => { accepted.push(ws); callback(ws, request); });
  });
  const { connect } = await host();
  const editor = await connect("editor"), client = await connect("client");
  const request = read(editor), response = read(client);
  client.send(JSON.stringify({ jsonrpc: "2.0", id: "closing", method: "write", params: {} }));
  await request;
  // Hold the server-side handshake before its close event, without a timer race.
  (accepted[0] as any)._readyState = WebSocket.CLOSING;
  const replacement = await connect("editor");
  const code = await Promise.race([
    once(replacement, "close").then(([code]) => code),
    new Promise(resolve => setTimeout(() => resolve(null), 100)),
  ]);
  expect(code).toBe(1013);
  accepted[0].terminate();
  expect((await response).error.message).toContain("outcome may be unknown");
  const next = await connect("editor");
  expect(next.readyState).toBe(WebSocket.OPEN);
});

it("forwards binary responses larger than the former 32 MiB frame limit", async () => {
  const { connect } = await host();
  const editor = await connect("editor"), client = await connect("client");
  const request = read(editor);
  client.send(JSON.stringify({ jsonrpc: "2.0", id: "large", method: "workspace/readFile", params: {} }));
  const forwarded = await request;
  const response = read(client);
  const encoded = Buffer.alloc(25 * 1024 * 1024, 42).toString("base64");
  editor.send(JSON.stringify({ jsonrpc: "2.0", id: forwarded.id, result: { $sparkBuffer: encoded } }));
  expect((await response).result.$sparkBuffer).toBe(encoded);
  expect(editor.readyState).toBe(WebSocket.OPEN);
});

it("keeps the owning editor when a second tab connects", async () => {
  const { connect } = await host();
  const editor = await connect("editor"), second = await connect("editor");
  const [code] = await once(second, "close");
  expect(code).toBe(1013);
  const client = await connect("client"), request = read(editor);
  client.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "read", params: {} }));
  expect((await request).method).toBe("read");
});
it("returns a useful error when no editor is connected", async () => {
  const { connect } = await host();
  const client = await connect("client");
  const result = read(client);
  client.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "window/loadedProjectId", params: {} }));
  expect((await result).error.message).toBe("No editor connected");
});
it("isolates duplicate ids from separate clients and forwards notifications", async () => {
  const { connect } = await host();
  const editor = await connect("editor");
  const a = await connect("client"), b = await connect("client");
  const first = read(editor);
  a.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "one", params: {} }));
  const requestA = await first;
  const second = read(editor);
  b.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "two", params: {} }));
  const requestB = await second;
  expect(requestA.id).not.toBe(requestB.id);
  const responseA = read(a), responseB = read(b);
  editor.send(JSON.stringify({ jsonrpc: "2.0", id: requestB.id, result: "B" }));
  editor.send(JSON.stringify({ jsonrpc: "2.0", id: requestA.id, result: "A" }));
  expect(await responseA).toEqual({ jsonrpc: "2.0", id: 1, result: "A" });
  expect(await responseB).toEqual({ jsonrpc: "2.0", id: 1, result: "B" });
  const published = read(editor);
  a.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: {} }));
  expect((await published).params.methods).toEqual(["*"]);
  const notification = read(a);
  editor.send(JSON.stringify({ jsonrpc: "2.0", method: "changed", params: { version: 2 } }));
  expect((await notification).params.version).toBe(2);
});
it("relays only subscribed notifications and tells the editor the union", async () => {
  const { connect } = await host();
  // A subscription sent before any editor connects is published on connect.
  const early = await connect("client");
  early.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: { methods: ["editor/didLoad"] } }));
  await new Promise(resolve => setTimeout(resolve, 20));
  const updates: any[] = [];
  const editor = await connect("editor", updates);
  const late = await connect("client"), idle = await connect("client");
  const idleMessages: any[] = [], earlyMessages: any[] = [], lateMessages: any[] = [];
  idle.on("message", data => idleMessages.push(JSON.parse(data.toString())));
  early.on("message", data => earlyMessages.push(JSON.parse(data.toString())));
  late.on("message", data => lateMessages.push(JSON.parse(data.toString())));
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  await settle();
  late.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: { methods: ["preview/didChangeGameState"] } }));
  await settle();
  for (const method of ["editor/didLoad", "preview/didChangeGameState", "other"]) {
    editor.send(JSON.stringify({ jsonrpc: "2.0", method, params: {} }));
  }
  await settle();
  expect(earlyMessages.map(m => m.method)).toEqual(["editor/didLoad"]);
  expect(lateMessages.map(m => m.method)).toEqual(["preview/didChangeGameState"]);
  expect(idleMessages).toEqual([]);
  late.close();
  await settle();
  early.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: { methods: [] } }));
  await settle();
  expect(updates.map(m => m.params.methods)).toEqual([
    ["editor/didLoad"],
    ["editor/didLoad", "preview/didChangeGameState"],
    ["editor/didLoad"],
    [],
  ]);
  // A subscriber that is replaced by a new editor is republished to it.
  early.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: { methods: ["x"] } }));
  await settle();
  editor.close();
  await settle();
  const republished: any[] = [];
  await connect("editor", republished);
  await settle();
  expect(republished.map(m => m.params.methods)).toEqual([["x"]]);
});
it("refuses a client that forges the editor's subscription update", async () => {
  const { connect } = await host();
  const received: any[] = [];
  await connect("editor", received);
  const client = await connect("client");
  client.send(JSON.stringify({ jsonrpc: "2.0", method: "$/bridgeSubscriptions", params: { methods: ["*"] } }));
  const [code] = await once(client, "close");
  expect(code).toBe(1007);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(received).toEqual([]);
});
it("rejects a malformed subscription", async () => {
  const { connect } = await host();
  const client = await connect("client");
  client.send(JSON.stringify({ jsonrpc: "2.0", method: "$/subscribe", params: { methods: "editor/didLoad" } }));
  const [code] = await once(client, "close");
  expect(code).toBe(1007);
});
it("rejects a browser from a different origin", async () => {
  const { origin } = await host();
  const socket = new WebSocket(`${origin.replace("http:", "ws:")}/__editor_protocol?role=client`, { origin: "https://untrusted.example" });
  cleanup.push(() => socket.terminate());
  const [error] = await once(socket, "error");
  expect(error.message).toContain("403");
});
it("fails outstanding requests when the editor disconnects", async () => {
  const { connect } = await host();
  const editor = await connect("editor"), client = await connect("client");
  const request = read(editor), response = read(client);
  client.send(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "write", params: {} }));
  await request;
  editor.close();
  expect((await response).error.message).toContain("outcome may be unknown");
});
