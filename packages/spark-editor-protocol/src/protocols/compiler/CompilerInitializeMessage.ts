import { RequestMessage } from "../../types/base/RequestMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompilerInitializeMethod = typeof CompilerInitializeMessage.method;

export interface CompilerInitializeParams {}

export interface CompilerInitializeResult {}

export class CompilerInitializeMessage {
  static readonly method = "compiler/initialize";
  static readonly type = new MessageProtocolRequestType<
    CompilerInitializeMethod,
    CompilerInitializeParams,
    CompilerInitializeResult
  >(CompilerInitializeMessage.method);
}

export namespace CompilerInitializeMessage {
  export interface Request
    extends RequestMessage<
      CompilerInitializeMethod,
      CompilerInitializeParams
    > {}
}
