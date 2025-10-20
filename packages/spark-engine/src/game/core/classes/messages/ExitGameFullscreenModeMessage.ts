import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type ExitGameFullscreenModeMethod =
  typeof ExitGameFullscreenModeMessage.method;

export interface ExitGameFullscreenModeParams {}

export interface ExitGameFullscreenModeResult {}

export class ExitGameFullscreenModeMessage {
  static readonly method = "game/exitFullscreen";
  static readonly type = new MessageProtocolRequestType<
    ExitGameFullscreenModeMethod,
    ExitGameFullscreenModeParams,
    ExitGameFullscreenModeResult
  >(ExitGameFullscreenModeMessage.method);
}

export namespace ExitGameFullscreenModeMessage {
  export interface Request
    extends RequestMessage<
      ExitGameFullscreenModeMethod,
      ExitGameFullscreenModeParams,
      ExitGameFullscreenModeResult
    > {}
  export interface Response
    extends ResponseMessage<
      ExitGameFullscreenModeMethod,
      ExitGameFullscreenModeResult
    > {}
}
