import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

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
