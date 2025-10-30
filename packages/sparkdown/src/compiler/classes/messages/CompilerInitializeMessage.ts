import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type CompilerInitializeMethod = typeof CompilerInitializeMessage.method;

export interface CompilerInitializeParams {
  profilerId: string;
}

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
