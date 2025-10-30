import { MessageCallback } from "@impower/jsonrpc/src/common/types/MessageCallback";

export class Socket {
  protected _listeners: Record<string, MessageCallback[]> = {};

  constructor(listeners: Record<string, MessageCallback[]>) {
    this._listeners = listeners;
  }

  addListener(method: string, callback: MessageCallback): void {
    this._listeners[method] ??= [];
    this._listeners[method]?.push(callback);
  }

  removeListener(method: string, callback: MessageCallback): void {
    const listeners = this._listeners[method];
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }

  removeAllListeners(): void {
    this._listeners = {};
  }
}
