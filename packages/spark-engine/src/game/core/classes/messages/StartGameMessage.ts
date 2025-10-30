import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type StartGameMethod = typeof StartGameMessage.method;

export interface StartGameParams {
  stopOnEntry?: boolean;
  debug?: boolean;
}

export interface StartGameResult {
  success: boolean;
}

export class StartGameMessage {
  static readonly method = "game/start";
  static readonly type = new MessageProtocolRequestType<
    StartGameMethod,
    StartGameParams,
    StartGameResult
  >(StartGameMessage.method);
}

export namespace StartGameMessage {
  export interface Request
    extends RequestMessage<StartGameMethod, StartGameParams, StartGameResult> {}
  export interface Response
    extends ResponseMessage<StartGameMethod, StartGameResult> {}
}
