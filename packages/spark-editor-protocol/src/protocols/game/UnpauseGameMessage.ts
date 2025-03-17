import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UnpauseGameMethod = typeof UnpauseGameMessage.method;

export interface UnpauseGameParams {}

export interface UnpauseGameResult {}

export class UnpauseGameMessage {
  static readonly method = "game/unpause";
  static readonly type = new MessageProtocolRequestType<
    UnpauseGameMethod,
    UnpauseGameParams,
    UnpauseGameResult
  >(UnpauseGameMessage.method);
}

export namespace UnpauseGameMessage {
  export interface Request
    extends RequestMessage<
      UnpauseGameMethod,
      UnpauseGameParams,
      UnpauseGameResult
    > {}
  export interface Response
    extends ResponseMessage<UnpauseGameMethod, UnpauseGameResult> {}
}
