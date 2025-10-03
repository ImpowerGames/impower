import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

export type ContinueGameMethod = typeof ContinueGameMessage.method;

export interface ContinueGameParams {
  reverse?: boolean;
}

export interface ContinueGameResult {
  done: boolean;
}

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
