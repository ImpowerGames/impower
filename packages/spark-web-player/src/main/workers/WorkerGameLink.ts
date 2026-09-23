import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";

type Listener = (message: any) => void;

/**
 * The page's end of the games in the player's worker (`installPlayerWorker`),
 * the one that previews and PLAY's, over the connection the workspace
 * compiles through. The worker sends the page one game's stream at a time.
 *
 * What the worker's game sends is told apart from the compiler's traffic by
 * its `epoch`: the engine's `Connection` stamps every message it sends with
 * one, and nothing else on the connection carries it. Each such message goes
 * to the attached sink (the `Application`'s router) and to the listeners for
 * its method, as a page-resident game's `connection.outgoing` would deliver
 * it; what the page answers goes back through `receive`.
 */
export class WorkerGameLink {
  protected _connection: MessageConnection;

  protected _sink?: (message: Message) => void;

  protected _listeners = new Map<string, Set<Listener>>();

  constructor(connection: MessageConnection) {
    this._connection = connection;
    connection.addEventListener("message", this.onMessage);
  }

  protected onMessage = (e: MessageEvent) => {
    const message = e.data;
    if (
      !message ||
      typeof message.epoch !== "number" ||
      !(isRequest(message) || isNotification(message))
    ) {
      return;
    }
    this._sink?.(message);
    const listeners = this._listeners.get(message.method);
    if (listeners) {
      for (const listener of listeners) {
        listener(message);
      }
    }
  };

  /** Deliver the game's messages to `sink` from now on. */
  attach(sink: (message: Message) => void): void {
    this._sink = sink;
  }

  /** Stop delivering the game's messages to `sink`, if it is attached. */
  detach(sink?: (message: Message) => void): void {
    if (!sink || this._sink === sink) {
      this._sink = undefined;
    }
  }

  /** Hear every message of `method` the game sends. */
  addListener(method: string, listener: Listener): () => void {
    let listeners = this._listeners.get(method);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(method, listeners);
    }
    listeners.add(listener);
    return () => listeners!.delete(listener);
  }

  /** Send the game what the page answers or reports (a response, an event). */
  receive(message: Message): void {
    this._connection.postMessage(message);
  }

  request<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R> {
    return this._connection.sendRequest(type, params);
  }
}
