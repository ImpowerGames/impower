import { Message } from "../types/base/Message";

export class MessageProtocol {
  static readonly event = "jsonrpc";
}

/**
 * Dispatch a spark-editor-protocol message on the CustomEvent bus that carries
 * editor ↔ worker/iframe/editor-view communication. Replaces the boilerplate
 * `target.dispatchEvent(new CustomEvent(MessageProtocol.event, { detail }))`.
 *
 * Named `sendProtocolMessage` (not `sendMessage`) to stay distinct from a
 * Worker's `postMessage` / `onmessage` — this is the in-page CustomEvent bus,
 * not the worker/port channel.
 *
 * `target` defaults to `window` (the shared bus). Pass an element to dispatch
 * somewhere that bubbles up to window instead (e.g. a shadow host).
 */
export const sendProtocolMessage = (
  message: Message,
  target: EventTarget = window,
): boolean =>
  target.dispatchEvent(
    new CustomEvent(MessageProtocol.event, {
      detail: message,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );

/**
 * Subscribe to a specific spark-editor-protocol message on the bus. Pass the
 * message's `.type` (e.g. `DidChangeWatchedFilesMessage.type`); the handler is
 * called only for that message, with the message fully typed — no
 * `instanceof CustomEvent` / `.type.is(...)` boilerplate. For a listener that
 * handles several message types, register one `onProtocolMessage` per type.
 * Returns a disposer that removes the listener. `target` defaults to `window`.
 *
 * Named `onProtocolMessage` (not `onMessage`) to stay distinct from a Worker's
 * `onmessage` — this is the in-page CustomEvent bus, not the worker channel.
 */
export const onProtocolMessage = <M>(
  type: { is: (value: any) => value is M },
  handler: (message: M) => void,
  target: EventTarget = window,
): (() => void) => {
  const listener = (e: Event) => {
    if (e instanceof CustomEvent && e.detail != null && type.is(e.detail)) {
      handler(e.detail);
    }
  };
  target.addEventListener(MessageProtocol.event, listener);
  return () => target.removeEventListener(MessageProtocol.event, listener);
};

/**
 * Subscribe to a protocol REQUEST and auto-send the handler's response. Pass
 * the request message's `.type` (e.g. `LoadEditorMessage.type`).
 *
 * Unlike `onProtocolMessage`, the handler's return type is REQUIRED to be that
 * message's response — it's inferred from the type's own `response()` — so
 * forgetting to `return` the response is a compile error instead of a silently
 * dropped reply. (A handler that legitimately answers only sometimes can return
 * `undefined`; nothing is sent in that case.)
 *
 * The reply is dispatched on `responseTarget` (default `window`). Pass a shadow
 * host / element when the reply must bubble out of a shadow root OR be picked
 * up by a relay that keys on `event.target !== window` (the player-iframe and
 * VS Code webview bridges do exactly that). Always listens on `window` — the
 * shared bus where requests arrive. Returns a disposer.
 */
export const onProtocolRequest = <Req, Res>(
  type: {
    is: (value: any) => value is Req;
    response: (...args: any[]) => Res;
  },
  handler: (message: Req) => Res | undefined | Promise<Res | undefined>,
  responseTarget: EventTarget = window,
): (() => void) => {
  const listener = (e: Event) => {
    if (e instanceof CustomEvent && e.detail != null && type.is(e.detail)) {
      void Promise.resolve(handler(e.detail)).then((response) => {
        if (response != null) {
          sendProtocolMessage(response as unknown as Message, responseTarget);
        }
      });
    }
  };
  window.addEventListener(MessageProtocol.event, listener);
  return () => window.removeEventListener(MessageProtocol.event, listener);
};

/**
 * A group of protocol-bus subscriptions sharing one `dispose()`. Each
 * `onMessage` / `onRequest` registers a listener AND records its disposer, so a
 * consumer with many listeners tears them all down with a single call instead
 * of hand-managing a `(() => void)[]`.
 *
 * Optionally pass a `wrap` middleware to the constructor — every handler is run
 * through it before registration (e.g. to add `performance` instrumentation).
 * The public `onMessage`/`onRequest` signatures stay fully typed (so the
 * missing-response footgun is still caught); `wrap` only sees the erased shape.
 */
export class ProtocolObserver {
  protected _disposers: (() => void)[] = [];

  constructor(
    protected wrap: (
      handler: (message: any) => any,
    ) => (message: any) => any = (handler) => handler,
  ) {}

  /**
   * Subscribe to a NOTIFICATION (a one-way message, no reply). The `response?:
   * never` constraint rejects request types — a request must be handled with
   * `onRequest` (which forces a reply), so the request/notification split is
   * type-checked both ways.
   */
  onNotification<M>(
    type: { is: (value: any) => value is M; response?: never },
    handler: (message: M) => void | Promise<void>,
    target: EventTarget = window,
  ): this {
    this._disposers.push(onProtocolMessage(type, this.wrap(handler), target));
    return this;
  }

  /** Subscribe to a request; the handler MUST return the message's response. */
  onRequest<Req, Res>(
    type: {
      is: (value: any) => value is Req;
      response: (...args: any[]) => Res;
    },
    handler: (message: Req) => Res | undefined | Promise<Res | undefined>,
    responseTarget: EventTarget = window,
  ): this {
    this._disposers.push(
      onProtocolRequest(type, this.wrap(handler), responseTarget),
    );
    return this;
  }

  /** Remove every listener registered through this observer. */
  dispose(): void {
    this._disposers.forEach((d) => d());
    this._disposers = [];
  }
}
