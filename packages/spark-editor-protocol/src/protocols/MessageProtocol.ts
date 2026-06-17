import { Message } from "../types/base/Message";

export class MessageProtocol {
  static readonly event = "jsonrpc";
}

/**
 * Dispatch a spark-editor-protocol message on the CustomEvent bus that carries
 * editor ↔ worker/iframe/editor-view communication. Replaces the boilerplate
 * `target.dispatchEvent(new CustomEvent(MessageProtocol.event, { detail }))`.
 *
 * `target` defaults to `window` (the shared bus). Pass an element to dispatch
 * somewhere that bubbles up to window instead (e.g. a shadow host).
 */
export const sendMessage = (
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
 * Subscribe to spark-editor-protocol messages on the bus. The handler receives
 * the message detail — narrow it with `SomeMessage.type.is(message)`. Returns a
 * disposer that removes the listener. `target` defaults to `window`.
 */
export const onMessage = (
  handler: (message: unknown) => void,
  target: EventTarget = window,
): (() => void) => {
  const listener = (e: Event) => {
    if (e instanceof CustomEvent) {
      handler(e.detail);
    }
  };
  target.addEventListener(MessageProtocol.event, listener);
  return () => target.removeEventListener(MessageProtocol.event, listener);
};
