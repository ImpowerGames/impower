import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type EnableGameDebugMethod = typeof EnableGameDebugMessage.method;

export interface EnableGameDebugParams {}

export interface EnableGameDebugResult {}

export class EnableGameDebugMessage {
  static readonly method = "game/enableDebug";
  static readonly type = new MessageProtocolRequestType<
    EnableGameDebugMethod,
    EnableGameDebugParams,
    EnableGameDebugResult
  >(EnableGameDebugMessage.method);
}

export namespace EnableGameDebugMessage {
  export interface Request
    extends RequestMessage<
      EnableGameDebugMethod,
      EnableGameDebugParams,
      EnableGameDebugResult
    > {}
  export interface Response
    extends ResponseMessage<EnableGameDebugMethod, EnableGameDebugResult> {}
}
