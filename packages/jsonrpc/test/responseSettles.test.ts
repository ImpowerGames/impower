import { describe, expect, it } from "vitest";
import { MessageConnection } from "../src/browser/classes/MessageConnection";
import { RequestError } from "../src/common/classes/RequestError";
import { RequestMessage } from "../src/common/types/RequestMessage";

// A pair of in-memory connections. `MessageConnection` is abstract over the
// transport, so this needs no worker, port or DOM — and it lets the tests
// assert that the response listener is actually torn down.
class TestConnection extends MessageConnection {
  protected _listeners = new Set<(e: MessageEvent) => void>();
  peer?: TestConnection;

  constructor() {
    super((message: any) => {
      // Deliver asynchronously, like a real port would.
      queueMicrotask(() => this.peer?.receive(message));
    });
  }

  override addEventListener(_event: "message", listener: any) {
    this._listeners.add(listener);
  }

  override removeEventListener(_event: "message", listener: any) {
    this._listeners.delete(listener);
  }

  receive(data: any) {
    for (const listener of [...this._listeners]) {
      listener({ data } as unknown as MessageEvent);
    }
  }

  get listenerCount() {
    return this._listeners.size;
  }
}

const pair = () => {
  const a = new TestConnection();
  const b = new TestConnection();
  a.peer = b;
  b.peer = a;
  return { a, b };
};

let nextId = 1;
const requestMessage = (method: string): RequestMessage<string, {}, any> =>
  ({
    jsonrpc: "2.0",
    method,
    id: nextId++,
    params: {},
  }) as RequestMessage<string, {}, any>;

// Answer whatever the peer asks with `handler`, then let the request settle.
const serve = (b: TestConnection, handler: () => any) => {
  b.addEventListener("message", (e: MessageEvent) => {
    const message = (e as any).data;
    if (message?.id !== undefined && message?.params !== undefined) {
      b.sendResponse(message, handler);
    }
  });
};

// A request that never settles would hang the test runner, so race it.
const TIMED_OUT = Symbol("timed out");
const settlesWithin = async (promise: Promise<unknown>, ms = 500) => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ status: "resolved" as const, value }),
        (error) => ({ status: "rejected" as const, error }),
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
  }
};

describe("MessageConnection response handling", () => {
  it("settles when the handler returns a value", async () => {
    const { a, b } = pair();
    serve(b, () => ({ ok: true }));
    const outcome = await settlesWithin(a.request(requestMessage("test/ok")));
    expect(outcome).toEqual({ status: "resolved", value: { ok: true } });
    expect(a.listenerCount).toBe(0);
  });

  // The bug: `WorkspaceFileSystem.executeCommand` returns undefined for an
  // unknown uri or an unrecognized command, so the response carried neither
  // `result` nor `error`, `isResponse` rejected it, and the awaiting promise
  // never settled.
  it("settles when the handler returns undefined", async () => {
    const { a, b } = pair();
    serve(b, () => undefined);
    const outcome = await settlesWithin(
      a.request(requestMessage("test/undefined")),
    );
    expect(outcome).not.toBe(TIMED_OUT);
    expect((outcome as any).status).toBe("resolved");
    expect((outcome as any).value).toBeNull();
  });

  it("does not leak its response listener when the handler returns undefined", async () => {
    const { a, b } = pair();
    serve(b, () => undefined);
    await settlesWithin(a.request(requestMessage("test/undefined-listener")));
    expect(a.listenerCount).toBe(0);
  });

  it("rejects with the handler's own code when it throws a ResponseError shape", async () => {
    const { a, b } = pair();
    serve(b, () => {
      throw { code: 1, message: "boom" };
    });
    const outcome = await settlesWithin(a.request(requestMessage("test/throw")));
    expect((outcome as any).status).toBe("rejected");
    expect((outcome as any).error).toBeInstanceOf(RequestError);
    expect((outcome as any).error.code).toBe(1);
    expect((outcome as any).error.message).toBe("boom");
    expect(a.listenerCount).toBe(0);
  });

  it("rejects with an internal-error code when the handler throws an Error", async () => {
    const { a, b } = pair();
    serve(b, () => {
      throw new Error("kaboom");
    });
    const outcome = await settlesWithin(
      a.request(requestMessage("test/throw-error")),
    );
    expect((outcome as any).status).toBe("rejected");
    // An Error's own numeric `code` (DOMException uses 8, 20, 25 …) is not a
    // JSON-RPC code and must not be forwarded as one.
    expect((outcome as any).error.code).toBe(-32603);
    expect((outcome as any).error.message).toBe("kaboom");
  });

  it("does not settle on a progress message for the same request", async () => {
    // `MessageProtocolRequestType.progress()` emits the bare method name, which
    // `isProgressResponse` does not match — so without an explicit guard these
    // land in the malformed-response branch and kill a healthy request.
    const { a, b } = pair();
    const request = requestMessage("test/progress");
    const pending = a.request(request);
    queueMicrotask(() =>
      a.receive({
        jsonrpc: "2.0",
        method: request.method,
        id: request.id,
        value: { percentage: 50 },
      }),
    );
    const outcome = await settlesWithin(pending, 200);
    expect(outcome).toBe(TIMED_OUT);
    // Still waiting for the real response, listener intact.
    expect(a.listenerCount).toBe(1);
    // …which then settles it normally.
    b.sendResponse(request as any, () => ({ ok: true }));
    expect(await settlesWithin(pending)).toEqual({
      status: "resolved",
      value: { ok: true },
    });
  });

  it("does not settle on an echo of the request itself", async () => {
    // The editor relays messages between window and iframe without filtering
    // by origin, so a request can come back to its own sender with a matching
    // id and method.
    const { a } = pair();
    const request = requestMessage("test/echo-self");
    const pending = a.request(request);
    queueMicrotask(() => a.receive({ ...request }));
    const outcome = await settlesWithin(pending, 200);
    expect(outcome).toBe(TIMED_OUT);
    expect(a.listenerCount).toBe(1);
  });

  // Defence in depth: even if some other producer emits a response with
  // neither field, the requester must not wait forever.
  it("rejects a hand-crafted response carrying neither result nor error", async () => {
    const { a } = pair();
    const request = requestMessage("test/malformed");
    const pending = a.request(request);
    queueMicrotask(() =>
      a.receive({ jsonrpc: "2.0", method: request.method, id: request.id }),
    );
    const outcome = await settlesWithin(pending);
    expect(outcome).not.toBe(TIMED_OUT);
    expect((outcome as any).status).toBe("rejected");
    expect((outcome as any).error.message).toContain("Malformed response");
    expect(a.listenerCount).toBe(0);
  });

  // `sendResponse`'s catch only built a ResponseError for objects carrying a
  // `message` property, so a bare string left both fields absent.
  it("settles when the handler throws a value that is not an Error", async () => {
    const { a, b } = pair();
    serve(b, () => {
      throw "just a string";
    });
    const outcome = await settlesWithin(
      a.request(requestMessage("test/throw-string")),
    );
    expect(outcome).not.toBe(TIMED_OUT);
    expect((outcome as any).status).toBe("rejected");
    expect((outcome as any).error.message).toBe("just a string");
    expect(a.listenerCount).toBe(0);
  });

  // The coercion runs inside the catch that builds the error response, so if it
  // throws, no response is sent at all and the caller hangs — the original bug.
  it("settles when the handler throws a value that cannot be stringified", async () => {
    const { a, b } = pair();
    serve(b, () => {
      throw Object.create(null);
    });
    const outcome = await settlesWithin(
      a.request(requestMessage("test/throw-exotic")),
    );
    expect(outcome).not.toBe(TIMED_OUT);
    expect((outcome as any).status).toBe("rejected");
    expect(a.listenerCount).toBe(0);
  });
});
