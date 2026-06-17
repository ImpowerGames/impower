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
