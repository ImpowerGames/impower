import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type InitializeMethod = typeof InitializeMessage.method;

export interface InitializeParams {}

export interface InitializeResult {}

export class InitializeMessage {
  static readonly method = "game/initialize";
  static readonly type = new MessageProtocolRequestType<
    InitializeMethod,
    InitializeParams,
    InitializeResult
  >(InitializeMessage.method);
}

export namespace InitializeMessage {
  export interface Request extends RequestMessage<
    InitializeMethod,
    InitializeParams,
    InitializeResult
  > {}
  export interface Response extends ResponseMessage<
    InitializeMethod,
    InitializeResult
  > {}
}
