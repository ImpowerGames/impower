import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

export type DisableGameDebugMethod = typeof DisableGameDebugMessage.method;

export interface DisableGameDebugParams {}

export interface DisableGameDebugResult {}

export class DisableGameDebugMessage {
  static readonly method = "game/disableDebug";
  static readonly type = new MessageProtocolRequestType<
    DisableGameDebugMethod,
    DisableGameDebugParams,
    DisableGameDebugResult
  >(DisableGameDebugMessage.method);
}

export namespace DisableGameDebugMessage {
  export interface Request
    extends RequestMessage<
      DisableGameDebugMethod,
      DisableGameDebugParams,
      DisableGameDebugResult
    > {}
  export interface Response
    extends ResponseMessage<DisableGameDebugMethod, DisableGameDebugResult> {}
}
