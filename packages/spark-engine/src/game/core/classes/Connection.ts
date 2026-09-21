import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { MessageCallback } from "@impower/jsonrpc/src/common/types/MessageCallback";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { Socket } from "./Socket";

/** JSON-RPC 2.0 "Method not found": the page has no handler for the request. */
export const METHOD_NOT_FOUND = -32601;

/** The page went away before it answered the request. */
export const DISCONNECTED = -32001;

/** The request belongs to a stream the page has already seen superseded, so
 *  the page did not act on it. */
export const SUPERSEDED = -32002;

/** A message the game sent, stamped with the stream it belongs to. */
export type StreamMessage = Message & { epoch?: number };

export interface ConnectionConfig {
  onSend?: (message: Message, transfer?: ArrayBuffer[]) => void;
  onReceive?: (
    _msg: RequestMessage | NotificationMessage,
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
    _msg: RequestMessage | NotificationMessage,
  ) => Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  >;

  protected _outgoingRequestResolveCallbacks: Record<
    string | number,
    (result: any) => void
  > = {};

  protected _outgoingRequestRejectCallbacks: Record<
    string | number,
    (error: ResponseError) => void
  > = {};

  protected _incomingListeners: Record<string, MessageCallback[]> = {};

  protected _outgoingListeners: Record<string, MessageCallback[]> = {};

  protected _epoch = 0;
  /** The stream every message sent now belongs to. The page drops a message
   *  from a stream older than the newest it has seen, so what a superseded
   *  stream still had in flight cannot land on the one that replaced it. */
  get epoch() {
    return this._epoch;
  }

  constructor(config: ConnectionConfig) {
    this._send = config.onSend;
    this._receive = config.onReceive;
  }

  /** Start a new stream: everything sent from here on supersedes what was
   *  sent before. */
  beginEpoch(): number {
    this._epoch += 1;
    return this._epoch;
  }

  connectOutput(onSend: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this._send = onSend;
  }

  connectInput(
    onReceive: (
      _msg: RequestMessage | NotificationMessage,
    ) => Promise<
      | { error: ResponseError; transfer?: ArrayBuffer[] }
      | { result: unknown; transfer?: ArrayBuffer[] }
      | { transfer?: ArrayBuffer[] }
      | undefined
    >,
  ) {
    this._receive = onReceive;
  }

  protected send(message: Message, transfer?: ArrayBuffer[]): void {
    const stamped: StreamMessage = { ...message, epoch: this._epoch };
    if (this._send) {
      this._send(stamped, transfer);
    }
    this.broadcast(stamped, this._outgoingListeners);
  }

  receive(message: Message): void {
    if ("id" in message) {
      if ("params" in message) {
        if (this._receive) {
          this._receive?.(message).then((response) => {
            if (response) {
              const transfer = response.transfer;
              const payload =
                "error" in response && response.error !== undefined
                  ? { error: response.error }
                  : {
                      result:
                        "result" in response ? (response.result ?? null) : null,
                    };
              this.send(
                {
                  jsonrpc: "2.0",
                  method: message.method,
                  id: message.id,
                  ...payload,
                },
                transfer,
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
    transfer?: ArrayBuffer[],
  ): Promise<R> {
    // JSON-RPC allows either a string or a number id, and `RequestMessage.id`
    // is typed to match -- so both have to be awaited. An empty-string id is
    // still treated as a notification, since it identifies nothing to reply to.
    if (
      "id" in msg &&
      (typeof msg.id === "number" ||
        (typeof msg.id === "string" && msg.id !== ""))
    ) {
      const result = await this.emitRequest(msg as RequestMessage, transfer);
      return result as R;
    } else {
      this.emitNotification(msg as NotificationMessage, transfer);
      return undefined as any;
    }
  }

  protected emitNotification<M extends string, P>(
    msg: NotificationMessage<M, P>,
    transfer?: ArrayBuffer[],
  ): void {
    this.send(msg, transfer);
  }

  protected async emitRequest<M extends string, P, R>(
    msg: RequestMessage<M, P>,
    transfer?: ArrayBuffer[],
  ): Promise<ResponseMessage<M, R>> {
    // Registered before the send: a page that answers at once (it dropped
    // the request, or has disconnected) answers inside the send.
    const response = new Promise<ResponseMessage<M, R>>((resolve, reject) => {
      this._outgoingRequestResolveCallbacks[msg.id] = resolve;
      this._outgoingRequestRejectCallbacks[msg.id] = reject;
    });
    this.send(msg, transfer);
    return response;
  }

  protected handleResponse<M extends string, R>(
    message: ResponseMessage<M, R>,
  ): void {
    if (message.result !== undefined) {
      const resolve = this._outgoingRequestResolveCallbacks[message.id];
      resolve?.(message.result);
    } else if (message.error !== undefined) {
      const reject = this._outgoingRequestRejectCallbacks[message.id];
      reject?.({ data: message.method, ...message.error });
    }
    delete this._outgoingRequestResolveCallbacks[message.id];
    delete this._outgoingRequestRejectCallbacks[message.id];
  }

  protected broadcast(
    message: Message,
    listenerMap: Record<string, MessageCallback[]>,
  ) {
    if (message.method) {
      const generalListeners = listenerMap["*"];
      if (generalListeners) {
        // broadcast message to all registered general listeners
        generalListeners.forEach((callback) => {
          callback?.(message as IMessage);
        });
      }
      const methodListeners = listenerMap[message.method];
      if (methodListeners) {
        // broadcast message to all registered method listeners
        methodListeners.forEach((callback) => {
          callback?.(message as IMessage);
        });
      }
    }
  }

  incoming = new Socket(this._incomingListeners);

  outgoing = new Socket(this._outgoingListeners);
}
