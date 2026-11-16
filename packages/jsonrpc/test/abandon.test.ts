import { describe, expect, it, vi } from "vitest";
import { MessageConnection } from "../src/browser/classes/MessageConnection";
import type { RequestMessage } from "../src/common/types/RequestMessage";

class SilentConnection extends MessageConnection {
  protected _listeners = new Set<(e: MessageEvent) => void>();

  constructor() {
    super(() => {});
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

let nextId = 1;
const requestMessage = (method: string): RequestMessage<string, {}, any> =>
  ({
    jsonrpc: "2.0",
    method,
    id: nextId++,
    params: {},
  }) as RequestMessage<string, {}, any>;

describe("waiting on many requests at once (I-2242)", () => {
  it("listens once however many requests wait, and answers each by its id", async () => {
    const connection = new SilentConnection();
    const messages = Array.from({ length: 500 }, (_, i) => requestMessage(`test/many-${i}`));
    const pending = messages.map((message) => connection.request(message));
    expect(connection.listenerCount).toBe(1);

    for (const message of [...messages].reverse()) {
      connection.receive({ jsonrpc: "2.0", method: message.method, id: message.id, result: message.method });
    }

    expect(await Promise.all(pending)).toEqual(messages.map((message) => message.method));
    expect(connection.listenerCount).toBe(0);
  });

  it("still delivers a reply to every request waiting on its id when one of their handlers throws, and reports the error", async () => {
    const reported: unknown[] = [];
    vi.stubGlobal("reportError", (error: unknown) => reported.push(error));
    try {
      const connection = new SilentConnection();
      const message = requestMessage("test/shared-id");
      const thrown = new Error("progress handler failed");
      const progress: unknown[] = [];
      const first = connection.request(message, undefined, () => {
        throw thrown;
      });
      const second = connection.request(message, undefined, (value) => progress.push(value));
      connection.receive({ jsonrpc: "2.0", method: `${message.method}/progress`, id: message.id, value: { percentage: 50 } });
      expect(progress).toEqual([{ percentage: 50 }]);
      expect(reported).toEqual([thrown]);
      connection.receive({ jsonrpc: "2.0", method: message.method, id: message.id, result: "done" });
      expect(await first).toBe("done");
      expect(await second).toBe("done");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves a request waiting when another request's answer arrives", async () => {
    const connection = new SilentConnection();
    const first = requestMessage("test/first-of-two");
    const second = requestMessage("test/second-of-two");
    const answered = connection.request(first);
    const waiting = connection.request(second);
    connection.receive({ jsonrpc: "2.0", method: first.method, id: first.id, result: "one" });
    expect(await answered).toBe("one");
    expect(connection.listenerCount).toBe(1);
    connection.receive({ jsonrpc: "2.0", method: second.method, id: second.id, result: "two" });
    expect(await waiting).toBe("two");
    expect(connection.listenerCount).toBe(0);
  });
});

describe("abandoning a connection's requests", () => {
  it("settles every request still waiting with the error it is given", async () => {
    const connection = new SilentConnection();
    const first = connection.request(requestMessage("test/first"));
    const second = connection.request(requestMessage("test/second"));
    expect(connection.listenerCount).toBe(1);

    const error = new Error("gone");
    connection.abandon(error);

    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
    expect(connection.listenerCount).toBe(0);
  });

  it("leaves a request that was answered, and settles only those since", async () => {
    const connection = new SilentConnection();
    const message = requestMessage("test/answered");
    const answered = connection.request(message);
    connection.receive({
      jsonrpc: "2.0",
      method: message.method,
      id: message.id,
      result: "done",
    });
    expect(await answered).toBe("done");

    const waiting = connection.request(requestMessage("test/waiting"));
    connection.abandon(new Error("gone"));
    await expect(waiting).rejects.toThrow("gone");
    expect(() => connection.abandon(new Error("again"))).not.toThrow();
  });
});
