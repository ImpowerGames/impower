import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type SetStartingDisplayModeMethod =
  typeof SetStartingDisplayModeMessage.method;

export type StartingDisplayMode = "textbox" | "textstream";

export interface SetStartingDisplayModeParams {
  mode: StartingDisplayMode;
}

export interface SetStartingDisplayModeResult {}

export class SetStartingDisplayModeMessage {
  static readonly method = "game/setStartingDisplayMode";
  static readonly type = new MessageProtocolRequestType<
    SetStartingDisplayModeMethod,
    SetStartingDisplayModeParams,
    SetStartingDisplayModeResult
  >(SetStartingDisplayModeMessage.method);
}

export namespace SetStartingDisplayModeMessage {
  export interface Request extends RequestMessage<
    SetStartingDisplayModeMethod,
    SetStartingDisplayModeParams,
    SetStartingDisplayModeResult
  > {}
  export type Response = ResponseMessage<
    SetStartingDisplayModeMethod,
    SetStartingDisplayModeResult
  >;
}
