import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

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
  export interface Request
    extends RequestMessage<
      InitializeMethod,
      InitializeParams,
      InitializeResult
    > {}
  export interface Response
    extends ResponseMessage<InitializeMethod, InitializeResult> {}
}
