import type { MessageCallback } from "@impower/jsonrpc/src/common/types/MessageCallback";

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
    // Clear in place. This map is shared by reference with the Connection that
    // broadcasts through it, so reassigning would detach the socket instead of
    // emptying it -- leaving old listeners firing and new ones dead.
    for (const method of Object.keys(this._listeners)) {
      delete this._listeners[method];
    }
  }
}
