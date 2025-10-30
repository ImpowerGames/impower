import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

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
