import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RestartGameMethod = typeof RestartGameMessage.method;

export interface RestartGameParams {
  stopOnEntry?: boolean;
  debug?: boolean;
}

export interface RestartGameResult {}

export class RestartGameMessage {
  static readonly method = "game/restart";
  static readonly type = new MessageProtocolRequestType<
    RestartGameMethod,
    RestartGameParams,
    RestartGameResult
  >(RestartGameMessage.method);
}

export namespace RestartGameMessage {
  export interface Request
    extends RequestMessage<
      RestartGameMethod,
      RestartGameParams,
      RestartGameResult
    > {}
  export interface Response
    extends ResponseMessage<RestartGameMethod, RestartGameResult> {}
}
