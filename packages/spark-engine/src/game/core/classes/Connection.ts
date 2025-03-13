import { IMessage } from "../types/IMessage";
import { Message } from "../types/Message";
import { MessageCallback } from "../types/MessageCallback";
import { NotificationMessage } from "../types/NotificationMessage";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { ResponseMessage } from "../types/ResponseMessage";
import { Socket } from "./Socket";

export interface ConnectionConfig {
  onSend?: (message: Message, transfer?: ArrayBuffer[]) => void;
  onReceive?: (
    _msg: RequestMessage | NotificationMessage
  ) => Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  >;
}

export class Connection {
  protected _send?: (message: Message, transfer?: ArrayBuffer[]) => void;

  protected _receive?: (
    _msg: RequestMessage | NotificationMessage
  ) => Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  >;

  protected _outgoingRequestCallbacks: Record<
    string | number,
    (response: ResponseMessage<any, any>) => void
  > = {};

  protected _incomingListeners: Record<string, MessageCallback[]> = {};

  protected _outgoingListeners: Record<string, MessageCallback[]> = {};

  constructor(config: ConnectionConfig) {
    this._send = config.onSend;
    this._receive = config.onReceive;
  }

  connectOutput(onSend: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this._send = onSend;
  }

  connectInput(
    onReceive: (
      _msg: RequestMessage | NotificationMessage
    ) => Promise<
      | { error: ResponseError; transfer?: ArrayBuffer[] }
      | { result: unknown; transfer?: ArrayBuffer[] }
      | { transfer?: ArrayBuffer[] }
      | undefined
    >
  ) {
    this._receive = onReceive;
  }

  protected send(message: Message, transfer?: ArrayBuffer[]): void {
    if (this._send) {
      this._send(message, transfer);
    }
    this.broadcast(message, this._outgoingListeners);
  }

  receive(message: Message): void {
    if ("id" in message) {
      if ("params" in message) {
        if (this._receive) {
          this._receive?.(message).then((response) => {
            if (response) {
              const transfer = response.transfer;
              delete response.transfer;
              this.send(
                {
                  jsonrpc: "2.0",
                  method: message.method,
                  id: message.id,
                  ...response,
                },
                transfer
              );
            }
          });
        }
      } else {
        this.handleResponse(message);
      }
    } else {
      if (this._receive) {
        this._receive?.(message);
      }
    }
    this.broadcast(message, this._incomingListeners);
  }

  async emit<M extends string, P, R>(
    msg: RequestMessage<M, P, R> | NotificationMessage<M, P>,
    transfer?: ArrayBuffer[]
  ): Promise<R> {
    if ("id" in msg && typeof msg.id === "string" && msg.id) {
      const response = await this.emitRequest(msg as RequestMessage, transfer);
      return response.result as R;
    } else {
      this.emitNotification(msg as NotificationMessage, transfer);
      return undefined as any;
    }
  }

  protected emitNotification<M extends string, P>(
    msg: NotificationMessage<M, P>,
    transfer?: ArrayBuffer[]
  ): void {
    this.send(msg, transfer);
  }

  protected async emitRequest<M extends string, P, R>(
    msg: RequestMessage<M, P>,
    transfer?: ArrayBuffer[]
  ): Promise<ResponseMessage<M, R>> {
    this.send(msg, transfer);
    return new Promise<ResponseMessage<M, R>>((callback) => {
      this._outgoingRequestCallbacks[msg.id] = callback;
    });
  }

  protected handleResponse<M extends string, R>(
    message: ResponseMessage<M, R>
  ): void {
    const callback = this._outgoingRequestCallbacks[message.id];
    callback?.(message);
    delete this._outgoingRequestCallbacks[message.id];
  }

  protected broadcast(
    message: Message,
    listenerMap: Record<string, MessageCallback[]>
  ) {
    if (message.method) {
      const listeners = listenerMap[message.method];
      if (listeners) {
        // broadcast message to all registered listeners
        listeners.forEach((callback) => {
          callback?.(message as IMessage);
        });
      }
    }
  }

  incoming = new Socket(this._incomingListeners);

  outgoing = new Socket(this._outgoingListeners);
}
