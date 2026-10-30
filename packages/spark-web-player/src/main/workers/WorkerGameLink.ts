import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { PageFramedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PageFramedMessage";

type Listener = (message: any) => void;

export class WorkerGameLink {
  protected _connection: MessageConnection;

  protected _sink?: (message: Message) => void;

  protected _channel?: BroadcastChannel;

  protected _listeners = new Map<string, Set<Listener>>();

  constructor(connection: MessageConnection) {
    this._connection = connection;
    connection.addEventListener("message", this.onConnectionMessage);
  }

  protected onConnectionMessage = (e: MessageEvent) => {
    if (!this._channel) {
      this.onMessage(e);
    }
  };

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

  reconnect(connection: MessageConnection): void {
    this._connection.removeEventListener("message", this.onConnectionMessage);
    this.detach();
    this._connection = connection;
    connection.addEventListener("message", this.onConnectionMessage);
  }

  attach(sink: (message: Message) => void): void {
    this.closeChannel();
    this._sink = sink;
  }

  attachPlay(sink: (message: Message) => void): string {
    this.attach(sink);
    const name = `impower-game-${crypto.randomUUID()}`;
    // workaround(chromium): after input, holds worker and port messages until the next rendered frame (median 8 ms, #811); BroadcastChannel messages are not held
    const channel = new BroadcastChannel(name);
    channel.onmessage = this.onMessage;
    this._channel = channel;
    this.sendFrames();
    return name;
  }

  detach(sink?: (message: Message) => void): void {
    if (!sink || this._sink === sink) {
      this._sink = undefined;
      this.closeChannel();
    }
  }

  protected closeChannel() {
    this._channel?.close();
    this._channel = undefined;
  }

  protected _framesSent = false;

  protected sendFrames() {
    if (this._framesSent || typeof requestAnimationFrame !== "function") {
      return;
    }
    this._framesSent = true;
    const frame = () => {
      if (!this._channel) {
        this._framesSent = false;
        return;
      }
      setTimeout(() => {
        if (this._channel) {
          this._connection.postMessage(
            PageFramedMessage.type.notification({}),
          );
        }
      }, 0);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  addListener(method: string, listener: Listener): () => void {
    let listeners = this._listeners.get(method);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(method, listeners);
    }
    listeners.add(listener);
    return () => listeners!.delete(listener);
  }

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
