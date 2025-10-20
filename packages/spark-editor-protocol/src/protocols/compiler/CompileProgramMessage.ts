import { SparkProgram } from "../../../../sparkdown/src/compiler/types/SparkProgram";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
