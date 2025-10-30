import { RequestMessage } from "../types/RequestMessage";
import { ResponseMessage } from "../types/ResponseMessage";
import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type ConnectMethod = typeof ConnectMessage.method;

export interface ConnectParams {}

export interface ConnectResult {}

export class ConnectMessage {
  static readonly method = "connect";
  static readonly type = new MessageProtocolRequestType<
    ConnectMethod,
    ConnectParams,
    ConnectResult
  >(ConnectMessage.method);
}

export namespace ConnectMessage {
  export interface Request
    extends RequestMessage<ConnectMethod, ConnectParams, ConnectResult> {}
  export interface Response
    extends ResponseMessage<ConnectMethod, ConnectResult> {}
}
