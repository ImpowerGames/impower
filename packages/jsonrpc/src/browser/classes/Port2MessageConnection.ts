import {
  MessageConnection,
  type MessageConnectionEvents,
} from "./MessageConnection";

export class Port2MessageConnection extends MessageConnection {
  protected _port2?: MessagePort;

  protected _targetOrigin?: string;

  protected _messageBuffer: { message: any; transfer?: Transferable[] }[] = [];

  protected _events: {
    [K in keyof MessageConnectionEvents]: Set<MessageConnectionEvents[K]>;
  } = {
    message: new Set(),
  };

  constructor(
    postMessage: (message: any, transfer?: Transferable[]) => void,
    targetOrigin?: string,
  ) {
    super(postMessage);
    this._targetOrigin = targetOrigin;
  }

  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K],
  ) {
    if (this._port2) {
      this._port2.addEventListener(event, listener);
    }
    this._events[event].add(listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K],
  ) {
    if (this._port2) {
      this._port2.removeEventListener(event, listener);
    }
    this._events[event].delete(listener);
  }

  override postMessage(message: any, transfer?: Transferable[]) {
    if (this._port2) {
      this._port2.postMessage(message, { transfer });
    } else {
      this._messageBuffer.push({ message, transfer });
    }
  }

  protected override canConnect(event: MessageEvent) {
    if (this._targetOrigin && event.origin !== this._targetOrigin) {
      return false;
    }
    if (event.ports[0]) {
      if (this._port2) {
        for (const listener of this._events.message) {
          this._port2.removeEventListener("message", listener);
        }
      }
      this._port2 = event.ports[0];
      this._port2.start();
      for (const listener of this._events.message) {
        this._port2.addEventListener("message", listener);
      }
      for (const e of this._messageBuffer) {
        this._port2.postMessage(e.message, { transfer: e.transfer });
      }
      this._messageBuffer.length = 0;
    }
    return true;
  }
}
