import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ContinueGameMethod = typeof ContinueGameMessage.method;

export interface ContinueGameParams {
  reverse?: boolean;
}

export interface ContinueGameResult {}

export class ContinueGameMessage {
  static readonly method = "game/continue";
  static readonly type = new MessageProtocolRequestType<
    ContinueGameMethod,
    ContinueGameParams,
    ContinueGameResult
  >(ContinueGameMessage.method);
}

export namespace ContinueGameMessage {
  export interface Request
    extends RequestMessage<
      ContinueGameMethod,
      ContinueGameParams,
      ContinueGameResult
    > {}
  export interface Response
    extends ResponseMessage<ContinueGameMethod, ContinueGameResult> {}
}
