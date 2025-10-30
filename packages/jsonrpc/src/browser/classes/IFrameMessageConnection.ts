import {
  MessageConnection,
  MessageConnectionEvents,
} from "./MessageConnection";

export class IFrameMessageConnection extends MessageConnection {
  protected _iframe: HTMLIFrameElement;

  protected _targetOrigin?: string;

  constructor(iframe: HTMLIFrameElement, targetOrigin?: string) {
    super(() => {});
    this._iframe = iframe;
    this._targetOrigin = targetOrigin;
    this._postMessage = (message: any, transfer?: Transferable[]) => {
      if (targetOrigin) {
        this._iframe.contentWindow?.postMessage(
          message,
          targetOrigin,
          transfer
        );
      } else {
        this._iframe.contentWindow?.postMessage(message, { transfer });
      }
    };
  }

  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    window.addEventListener(event, listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    window.removeEventListener(event, listener);
  }
}
