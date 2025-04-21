import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ResizeGameMethod = typeof ResizeGameMessage.method;

export interface ResizeGameParams {
  height: number;
}

export interface ResizeGameResult {}

export class ResizeGameMessage {
  static readonly method = "game/resize";
  static readonly type = new MessageProtocolRequestType<
    ResizeGameMethod,
    ResizeGameParams,
    ResizeGameResult
  >(ResizeGameMessage.method);
}

export namespace ResizeGameMessage {
  export interface Request
    extends RequestMessage<
      ResizeGameMethod,
      ResizeGameParams,
      ResizeGameResult
    > {}
  export interface Response
    extends ResponseMessage<ResizeGameMethod, ResizeGameResult> {}
}
