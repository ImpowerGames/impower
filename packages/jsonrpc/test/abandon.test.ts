import { describe, expect, it } from "vitest";
import { MessageConnection } from "../src/browser/classes/MessageConnection";
import type { RequestMessage } from "../src/common/types/RequestMessage";

// A connection whose peer never answers, as a worker that is stuck, or has
// been terminated, does not (#679).
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

describe("abandoning a connection's requests", () => {
  it("settles every request still waiting with the error it is given", async () => {
    const connection = new SilentConnection();
    const first = connection.request(requestMessage("test/first"));
    const second = connection.request(requestMessage("test/second"));
    expect(connection.listenerCount).toBe(2);

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
    // Nothing is left to settle.
    expect(() => connection.abandon(new Error("again"))).not.toThrow();
  });
});
