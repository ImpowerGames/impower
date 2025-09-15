import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
