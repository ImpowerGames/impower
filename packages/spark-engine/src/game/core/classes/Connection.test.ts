import { Message } from "@impower/jsonrpc/src/common/types/Message";
import { describe, expect, it } from "vitest";
import { Connection } from "./Connection";

/**
 * `Connection` is the seam every module talks through, and it multiplexes
 * three different things over one `receive()`: notifications (fire and
 * forget), requests (expect a reply), and responses (are a reply). Getting
 * that classification wrong doesn't throw -- it silently drops a message or
 * leaves a promise pending forever -- so it's worth pinning explicitly.
 */

const notification = (method = "note", params: unknown = {}) =>
  ({ jsonrpc: "2.0", method, params }) as Message;

const request = (id: string, method = "ask", params: unknown = {}) =>
  ({ jsonrpc: "2.0", id, method, params }) as Message;

const response = (id: string, method: string, result: unknown) =>
  ({ jsonrpc: "2.0", id, method, result }) as Message;

const errorResponse = (id: string, method: string, error: unknown) =>
  ({ jsonrpc: "2.0", id, method, error }) as Message;

/**
 * Exposes the pending-request bookkeeping. A settled request that leaves its
 * callbacks behind is invisible from outside -- resolving an already-resolved
 * promise is a silent no-op -- but it leaks for the life of the connection,
 * so it's worth asserting directly.
 */
class ProbeConnection extends Connection {
  get pendingRequestIds(): string[] {
    return [
      ...new Set([
        ...Object.keys(this._outgoingRequestResolveCallbacks),
        ...Object.keys(this._outgoingRequestRejectCallbacks),
      ]),
    ];
  }
}

/** A connection with recorded output and a configurable inbound handler. */
const createConnection = (
  onReceive?: (msg: never) => Promise<unknown | undefined>,
) => {
  const sent: Message[] = [];
  const transfers: (ArrayBuffer[] | undefined)[] = [];
  const connection = new ProbeConnection({
    onSend: (message, transfer) => {
      sent.push(message);
      transfers.push(transfer);
    },
    onReceive: onReceive as never,
  });
  return { connection, sent, transfers };
};

/** Whether a promise has settled, without hanging the test if it hasn't. */
const settled = async (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      (value) => ({ state: "resolved" as const, value }),
      (error) => ({ state: "rejected" as const, error }),
    ),
    new Promise<{ state: "pending" }>((resolve) =>
      setTimeout(() => resolve({ state: "pending" }), 20),
    ),
  ]);

describe("Connection", () => {
  describe("emitting notifications", () => {
    it("sends the message", async () => {
      const { connection, sent } = createConnection();
      await connection.emit(notification("note") as never);
      expect(sent).toEqual([notification("note")]);
    });

    it("does not wait for a reply", async () => {
      const { connection } = createConnection();
      const result = await settled(
        connection.emit(notification() as never) as Promise<unknown>,
      );
      expect(result).toEqual({ state: "resolved", value: undefined });
    });
  });

  describe("emitting requests", () => {
    it("sends the message", () => {
      const { connection, sent } = createConnection();
      void connection.emit(request("r1") as never);
      expect(sent).toEqual([request("r1")]);
    });

    it("stays pending until a response arrives", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1") as never);
      expect(await settled(pending)).toEqual({ state: "pending" });
    });

    it("resolves with the response result", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1", "ask") as never);
      connection.receive(response("r1", "ask", { ok: true }));
      expect(await settled(pending)).toEqual({
        state: "resolved",
        value: { ok: true },
      });
    });

    it("rejects on an error response, tagging it with the method", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1", "ask") as never);
      connection.receive(
        errorResponse("r1", "ask", { code: 1, message: "nope" }),
      );
      expect(await settled(pending)).toEqual({
        state: "rejected",
        error: { data: "ask", code: 1, message: "nope" },
      });
    });

    it("keeps concurrent requests separate by id", async () => {
      const { connection } = createConnection();
      const first = connection.emit(request("r1", "ask") as never);
      const second = connection.emit(request("r2", "ask") as never);

      connection.receive(response("r2", "ask", "second"));
      expect(await settled(second)).toEqual({
        state: "resolved",
        value: "second",
      });
      expect(await settled(first)).toEqual({ state: "pending" });

      connection.receive(response("r1", "ask", "first"));
      expect(await settled(first)).toEqual({
        state: "resolved",
        value: "first",
      });
    });

    it("ignores a duplicate response", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1", "ask") as never);
      connection.receive(response("r1", "ask", "once"));
      expect(await settled(pending)).toEqual({
        state: "resolved",
        value: "once",
      });
      expect(() =>
        connection.receive(response("r1", "ask", "twice")),
      ).not.toThrow();
    });

    it("tracks a request as pending until it is answered", () => {
      const { connection } = createConnection();
      void connection.emit(request("r1", "ask") as never);
      expect(connection.pendingRequestIds).toEqual(["r1"]);
    });

    it("forgets a request once it resolves", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1", "ask") as never);
      connection.receive(response("r1", "ask", "value"));
      await settled(pending);
      expect(connection.pendingRequestIds).toEqual([]);
    });

    it("forgets a request once it rejects", async () => {
      const { connection } = createConnection();
      const pending = connection.emit(request("r1", "ask") as never);
      connection.receive(errorResponse("r1", "ask", { code: 1, message: "x" }));
      await settled(pending);
      expect(connection.pendingRequestIds).toEqual([]);
    });

    it("does not leak bookkeeping across many requests", async () => {
      const { connection } = createConnection();
      for (let i = 0; i < 5; i += 1) {
        const pending = connection.emit(request(`r${i}`, "ask") as never);
        connection.receive(response(`r${i}`, "ask", i));
        await settled(pending);
      }
      expect(connection.pendingRequestIds).toEqual([]);
    });
  });

  describe("receiving", () => {
    it("hands a notification to the handler and replies with nothing", async () => {
      const seen: Message[] = [];
      const { connection, sent } = createConnection(async (msg) => {
        seen.push(msg);
        return undefined;
      });
      connection.receive(notification("note"));
      await Promise.resolve();
      expect(seen).toEqual([notification("note")]);
      expect(sent).toEqual([]);
    });

    it("replies to a request with the handler's result", async () => {
      const { connection, sent } = createConnection(async () => ({
        result: 42,
      }));
      connection.receive(request("r1", "ask"));
      await Promise.resolve();
      await Promise.resolve();
      expect(sent).toEqual([
        { jsonrpc: "2.0", method: "ask", id: "r1", result: 42 },
      ]);
    });

    it("sends nothing when the handler returns undefined", async () => {
      const { connection, sent } = createConnection(async () => undefined);
      connection.receive(request("r1", "ask"));
      await Promise.resolve();
      await Promise.resolve();
      expect(sent).toEqual([]);
    });

    // Transferables ride alongside the message rather than inside it, so they
    // have to be lifted out of the handler's result before it goes on the wire.
    it("forwards transferables out of band", async () => {
      const buffer = new ArrayBuffer(8);
      const { connection, sent, transfers } = createConnection(async () => ({
        result: "ok",
        transfer: [buffer],
      }));
      connection.receive(request("r1", "ask"));
      await Promise.resolve();
      await Promise.resolve();
      expect(transfers).toEqual([[buffer]]);
      expect(sent[0]).not.toHaveProperty("transfer");
    });

    it("does not treat a response as something to handle", async () => {
      const seen: Message[] = [];
      const { connection, sent } = createConnection(async (msg) => {
        seen.push(msg);
        return { result: "should not happen" };
      });
      connection.receive(response("r1", "ask", "value"));
      await Promise.resolve();
      expect(seen).toEqual([]);
      expect(sent).toEqual([]);
    });
  });

  describe("late binding", () => {
    it("uses an output connected after construction", async () => {
      const connection = new Connection({});
      const sent: Message[] = [];
      connection.connectOutput((message) => sent.push(message));
      await connection.emit(notification("note") as never);
      expect(sent).toEqual([notification("note")]);
    });

    it("uses an input connected after construction", async () => {
      const connection = new Connection({});
      const seen: Message[] = [];
      connection.connectInput(async (msg) => {
        seen.push(msg);
        return undefined;
      });
      connection.receive(notification("note"));
      await Promise.resolve();
      expect(seen).toEqual([notification("note")]);
    });
  });

  describe("listener sockets", () => {
    it("notifies incoming listeners on receive", () => {
      const seen: Message[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("note", (m) => seen.push(m as Message));
      connection.receive(notification("note"));
      expect(seen).toEqual([notification("note")]);
    });

    it("notifies outgoing listeners on emit", async () => {
      const seen: Message[] = [];
      const { connection } = createConnection();
      connection.outgoing.addListener("note", (m) => seen.push(m as Message));
      await connection.emit(notification("note") as never);
      expect(seen).toEqual([notification("note")]);
    });

    it("keeps the two directions separate", async () => {
      const incoming: Message[] = [];
      const outgoing: Message[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("note", (m) =>
        incoming.push(m as Message),
      );
      connection.outgoing.addListener("note", (m) =>
        outgoing.push(m as Message),
      );

      connection.receive(notification("note"));
      expect(incoming).toHaveLength(1);
      expect(outgoing).toHaveLength(0);

      await connection.emit(notification("note") as never);
      expect(incoming).toHaveLength(1);
      expect(outgoing).toHaveLength(1);
    });

    it("delivers any method to a wildcard listener", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("*", (m) => seen.push(m.method));
      connection.receive(notification("one"));
      connection.receive(notification("two"));
      expect(seen).toEqual(["one", "two"]);
    });

    it("delivers to both the wildcard and the method listener", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("*", () => seen.push("wildcard"));
      connection.incoming.addListener("note", () => seen.push("specific"));
      connection.receive(notification("note"));
      expect(seen).toEqual(["wildcard", "specific"]);
    });

    it("does not deliver to a listener for a different method", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("other", () => seen.push("other"));
      connection.receive(notification("note"));
      expect(seen).toEqual([]);
    });

    it("runs every listener registered for a method", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("note", () => seen.push("a"));
      connection.incoming.addListener("note", () => seen.push("b"));
      connection.receive(notification("note"));
      expect(seen).toEqual(["a", "b"]);
    });

    it("stops delivering to a removed listener", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      const callback = () => seen.push("hit");
      connection.incoming.addListener("note", callback);
      connection.receive(notification("note"));
      expect(seen).toEqual(["hit"]);

      connection.incoming.removeListener("note", callback);
      connection.receive(notification("note"));
      expect(seen).toEqual(["hit"]);
    });

    it("leaves other listeners alone when one is removed", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      const removed = () => seen.push("removed");
      connection.incoming.addListener("note", removed);
      connection.incoming.addListener("note", () => seen.push("kept"));

      connection.incoming.removeListener("note", removed);
      connection.receive(notification("note"));
      expect(seen).toEqual(["kept"]);
    });

    it("ignores removal of a listener that was never added", () => {
      const { connection } = createConnection();
      expect(() =>
        connection.incoming.removeListener("note", () => {}),
      ).not.toThrow();
    });

    it("does not broadcast a message with no method", () => {
      const seen: string[] = [];
      const { connection } = createConnection();
      connection.incoming.addListener("*", () => seen.push("hit"));
      connection.receive({ jsonrpc: "2.0" } as Message);
      expect(seen).toEqual([]);
    });

    // `removeAllListeners()` is deliberately NOT covered here. It replaces the
    // socket's listener map instead of clearing it, which detaches the socket
    // from the map `Connection` actually broadcasts to -- so previously
    // registered listeners keep firing and newly added ones never do. Asserting
    // either way would be wrong: the current behaviour is a bug, and the
    // intended behaviour doesn't exist yet. Tracked separately.
  });
});
