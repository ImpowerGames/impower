import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { SparkProgram } from "../../types/SparkProgram";

export type CompileProgramMethod = typeof CompileProgramMessage.method;

export interface CompileProgramParams {
  uri: string;
}

export type CompileProgramResult = SparkProgram;

export class CompileProgramMessage {
  static readonly method = "compiler/compile";
  static readonly type = new MessageProtocolRequestType<
    CompileProgramMethod,
    CompileProgramParams,
    SparkProgram
  >(CompileProgramMessage.method);
}

export namespace CompileProgramMessage {
  export interface Request
    extends RequestMessage<
      CompileProgramMethod,
      CompileProgramParams,
      CompileProgramResult
    > {}
  export interface Response
    extends ResponseMessage<CompileProgramMethod, CompileProgramResult> {}
}
