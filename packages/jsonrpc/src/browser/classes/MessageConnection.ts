import { ConnectMessage } from "../../common/classes/ConnectMessage";
import { MessageProtocolNotificationType } from "../../common/classes/MessageProtocolNotificationType";
import { MessageProtocolRequestType } from "../../common/classes/MessageProtocolRequestType";
import { RequestError } from "../../common/classes/RequestError";
import { ProgressValue } from "../../common/types/ProgressValue";
import { RequestMessage } from "../../common/types/RequestMessage";
import { ResponseError } from "../../common/types/ResponseError";
import { ResponseMessage } from "../../common/types/ResponseMessage";
import { isProgressResponse } from "../../common/utils/isProgressResponse";
import { isResponse } from "../../common/utils/isResponse";
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

  connect(connection: MessageConnection, ...args: any[]) {
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
    listener: MessageConnectionEvents[K]
  ): void;

  abstract removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ): void;

  postMessage(message: any, transfer?: Transferable[]) {
    this._postMessage(message, transfer);
  }

  protected canConnect(event: MessageEvent): boolean {
    return true;
  }

  profile(id: string) {
    this._profilerId = id;
  }

  async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer?: Transferable[],
    onProgress?: (value: ProgressValue) => void
  ): Promise<R> {
    const request = type.request(params);
    return new Promise<R>((resolve, reject) => {
      const onResponse = (e: MessageEvent) => {
        const message = e.data;
        if (typeof message === "object") {
          if (message.id === request.id) {
            if (isResponse<string, R>(message, request.method)) {
              if (message.error !== undefined) {
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

  async sendResponse<
    M extends string,
    P,
    R extends object | string | boolean | number
  >(
    message: RequestMessage<M, P, R>,
    result: R | (() => Promise<R> | R),
    transfer?: Transferable[]
  ) {
    const method = message.method;
    const id = message.id;
    profile("start", this._profilerId, "response " + method);
    let responseResult: R | undefined = undefined;
    let responseError: ResponseError | undefined = undefined;
    try {
      responseResult = typeof result === "function" ? await result() : result;
    } catch (e) {
      if (typeof e === "object" && e) {
        if ("message" in e) {
          responseError = e as ResponseError;
        }
      }
    }
    profile("start", this._profilerId, "send response " + method);
    const response: ResponseMessage<M, R> = {
      jsonrpc: "2.0",
      method,
      id,
    };
    if (responseResult !== undefined) {
      response.result = responseResult;
    }
    if (responseError !== undefined) {
      response.error = responseError;
    }
    this.postMessage(response, transfer);
    profile("end", this._profilerId, "send response " + method);
    profile("end", this._profilerId, "response " + method);
  }

  sendNotification<M extends string, P extends object>(
    type: MessageProtocolNotificationType<M, P>,
    params: P,
    transfer?: Transferable[]
  ) {
    const response = type.notification(params);
    this.postMessage(response, transfer);
  }
}
