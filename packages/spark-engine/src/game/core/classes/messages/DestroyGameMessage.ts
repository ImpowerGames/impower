import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type DestroyGameMethod = typeof DestroyGameMessage.method;

export interface DestroyGameParams {}

export interface DestroyGameResult {}

export class DestroyGameMessage {
  static readonly method = "game/destroy";
  static readonly type = new MessageProtocolRequestType<
    DestroyGameMethod,
    DestroyGameParams,
    DestroyGameResult
  >(DestroyGameMessage.method);
}

export namespace DestroyGameMessage {
  export interface Request
    extends RequestMessage<
      DestroyGameMethod,
      DestroyGameParams,
      DestroyGameResult
    > {}
  export interface Response
    extends ResponseMessage<DestroyGameMethod, DestroyGameResult> {}
}
