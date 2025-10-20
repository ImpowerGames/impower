import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type EnterGameFullscreenModeMethod =
  typeof EnterGameFullscreenModeMessage.method;

export interface EnterGameFullscreenModeParams {}

export interface EnterGameFullscreenModeResult {}

export class EnterGameFullscreenModeMessage {
  static readonly method = "game/enterFullscreen";
  static readonly type = new MessageProtocolRequestType<
    EnterGameFullscreenModeMethod,
    EnterGameFullscreenModeParams,
    EnterGameFullscreenModeResult
  >(EnterGameFullscreenModeMessage.method);
}

export namespace EnterGameFullscreenModeMessage {
  export interface Request
    extends RequestMessage<
      EnterGameFullscreenModeMethod,
      EnterGameFullscreenModeParams,
      EnterGameFullscreenModeResult
    > {}
  export interface Response
    extends ResponseMessage<
      EnterGameFullscreenModeMethod,
      EnterGameFullscreenModeResult
    > {}
}
