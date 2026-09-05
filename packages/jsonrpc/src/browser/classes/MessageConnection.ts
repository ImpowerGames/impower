import { ConnectMessage } from "../../common/classes/ConnectMessage";
import { MessageProtocolNotificationType } from "../../common/classes/MessageProtocolNotificationType";
import { MessageProtocolRequestType } from "../../common/classes/MessageProtocolRequestType";
import { RequestError } from "../../common/classes/RequestError";
import type { NotificationMessage } from "../../common/types/NotificationMessage";
import type { ProgressValue } from "../../common/types/ProgressValue";
import type { RequestMessage } from "../../common/types/RequestMessage";
import type { ResponseError } from "../../common/types/ResponseError";
import type { ResponseMessage } from "../../common/types/ResponseMessage";
import { isProgressResponse } from "../../common/utils/isProgressResponse";
import { isResponse } from "../../common/utils/isResponse";
import {
  INTERNAL_ERROR,
  toResponseError,
} from "../../common/utils/toResponseError";
import { profile } from "../utils/profile";

export type MessageConnectionEvents = {
  message: (e: MessageEvent) => void;
};

export abstract class MessageConnection {
  protected _connected?: boolean;
  get connected() {
    return this._connected;
  }

  protected _profilerId?: string;

  protected _postMessage: (message: any, transfer?: Transferable[]) => void;

  constructor(postMessage: (message: any, transfer?: Transferable[]) => void) {
    this._postMessage = postMessage;
  }

  connect(connection: MessageConnection, ..._args: any[]) {
    return connection.sendRequest(ConnectMessage.type, {});
  }

  listen() {
    self.addEventListener("message", async (e: MessageEvent) => {
      const message = e.data;
      if (ConnectMessage.type.is(message)) {
        if (this.canConnect(e)) {
          this._postMessage(ConnectMessage.type.response(message.id, {}));
          this._connected = true;
        }
      }
    });
  }

  abstract addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K],
  ): void;

  abstract removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K],
  ): void;

  postMessage(message: any, transfer?: Transferable[]) {
    this._postMessage(message, transfer);
  }

  protected canConnect(_event: MessageEvent): boolean {
    return true;
  }

  profile(id: string) {
    this._profilerId = id;
  }

  notify<M extends string, P extends object>(
    message: NotificationMessage<M, P>,
    transfer?: Transferable[],
  ) {
    this.postMessage(message, transfer);
  }

  async request<M extends string, P, R>(
    request: RequestMessage<M, P, R>,
    transfer?: Transferable[],
    onProgress?: (value: ProgressValue) => void,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const onResponse = (e: MessageEvent) => {
        const message = e.data;
        if (typeof message === "object") {
          if (message.id === request.id) {
            if (isResponse<string, R>(message, request.method)) {
              if (message.error !== undefined) {
                console.error(message.error);
                profile("end", this._profilerId, "request " + request.method);
                reject(new RequestError(message.error));
                this.removeEventListener("message", onResponse);
              } else if (message.result !== undefined) {
                profile("end", this._profilerId, "request " + request.method);
                resolve(message.result);
                this.removeEventListener("message", onResponse);
              }
            } else if (isProgressResponse(message, request.method)) {
              onProgress?.(message.value);
            } else if (
              message.method === request.method &&
              message.params === undefined &&
              message.value === undefined
            ) {
              // Addressed to this request, but carries neither `result` nor
              // `error`, so `isResponse` rejected it. Settle rather than wait
              // forever — a silent hang is far harder to diagnose than a
              // rejection.
              //
              // The two exclusions are load-bearing, because `id` alone does
              // not identify a response: `isRequest` is also true for a
              // message with neither field, and requests always carry `params`
              // (this connection's ids are short `Math.random()` strings, not
              // uuids, so id uniqueness cannot be relied on either). Progress
              // messages carry `value` and are meant to be ignored here —
              // `MessageProtocolRequestType.progress()` emits them under the
              // bare method name, which `isProgressResponse` does not match,
              // so without the `value` guard they would land in this branch
              // and kill a healthy in-flight request.
              profile("end", this._profilerId, "request " + request.method);
              reject(
                new RequestError({
                  code: INTERNAL_ERROR,
                  message:
                    `Malformed response to "${request.method}": ` +
                    `carries neither "result" nor "error"`,
                }),
              );
              this.removeEventListener("message", onResponse);
            }
          }
        }
      };
      this.addEventListener("message", onResponse);
      profile("start", this._profilerId, "request " + request.method);
      profile("start", this._profilerId, "send request " + request.method);
      this.postMessage(request, transfer);
      profile("end", this._profilerId, "send request " + request.method);
    });
  }

  async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer?: Transferable[],
    onProgress?: (value: ProgressValue) => void,
  ): Promise<R> {
    const request = type.request(params);
    return this.request(request, transfer, onProgress);
  }

  async sendResponse<
    M extends string,
    P,
    R extends object | string | boolean | number,
  >(
    message: RequestMessage<M, P, R>,
    result: R | (() => Promise<R> | R),
    transfer?: Transferable[],
  ) {
    const method = message.method;
    const id = message.id;
    profile("start", this._profilerId, "response " + method);
    let responseResult: R | undefined = undefined;
    let responseError: ResponseError | undefined = undefined;
    try {
      responseResult = typeof result === "function" ? await result() : result;
    } catch (e) {
      console.error(e);
      responseError = toResponseError(e);
    }
    profile("start", this._profilerId, "send response " + method);
    const response: ResponseMessage<M, R> = {
      jsonrpc: "2.0",
      method,
      id,
    };
    // Every response MUST carry exactly one of `result` / `error`. JSON-RPC 2.0
    // requires it, and more concretely `isResponse` keys on their presence: a
    // response with neither is not recognized as a response at all, so the
    // requester never resolves, never rejects, and never removes its listener.
    // A handler that returns nothing therefore has to send an explicit `null`.
    if (responseError !== undefined) {
      response.error = responseError;
    } else {
      response.result = (responseResult ?? null) as R;
    }
    try {
      this.postMessage(response, transfer);
    } catch (e) {
      // A result that cannot be structured-cloned throws here, and an
      // unsent response is the same permanent hang this method exists to
      // avoid — so fall back to reporting the failure instead of nothing.
      console.error(e);
      this.postMessage({
        jsonrpc: "2.0",
        method,
        id,
        error: toResponseError(e),
      } as ResponseMessage<M, R>);
    }
    profile("end", this._profilerId, "send response " + method);
    profile("end", this._profilerId, "response " + method);
  }

  sendNotification<M extends string, P extends object>(
    type: MessageProtocolNotificationType<M, P>,
    params: P,
    transfer?: Transferable[],
  ) {
    const notification = type.notification(params);
    this.notify(notification, transfer);
  }
}
