import { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CompileProgramMethod = typeof CompileProgramMessage.method;

export interface CompileProgramParams {
  uri: string;
}

export class CompileProgramMessage {
  static readonly method = "compiler/compile";
  static readonly type = new MessageProtocolRequestType<
    CompileProgramMethod,
    CompileProgramParams,
    SparkProgram
  >(CompileProgramMessage.method);
}
