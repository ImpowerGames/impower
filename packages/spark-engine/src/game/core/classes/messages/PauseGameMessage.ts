import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type PauseGameMethod = typeof PauseGameMessage.method;

export interface PauseGameParams {}

export interface PauseGameResult {}

export class PauseGameMessage {
  static readonly method = "game/pause";
  static readonly type = new MessageProtocolRequestType<
    PauseGameMethod,
    PauseGameParams,
    PauseGameResult
  >(PauseGameMessage.method);
}

export namespace PauseGameMessage {
  export interface Request
    extends RequestMessage<PauseGameMethod, PauseGameParams, PauseGameResult> {}
  export interface Response
    extends ResponseMessage<PauseGameMethod, PauseGameResult> {}
}
