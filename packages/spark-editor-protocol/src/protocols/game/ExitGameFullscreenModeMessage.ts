import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
