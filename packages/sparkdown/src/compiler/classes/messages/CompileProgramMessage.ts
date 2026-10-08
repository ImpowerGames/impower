import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { SparkProgram } from "../../types/SparkProgram";
import type { VersionedTextDocumentIdentifier } from "../../types/VersionedTextDocumentIdentifier";

export type CompileProgramMethod = typeof CompileProgramMessage.method;

export interface CompileProgramParams {
  textDocument: { uri: string };
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
}

export interface CompileProgramResult {
  /**
   * The document that was parsed.
   */
  textDocument: VersionedTextDocumentIdentifier;
  /**
   * The parsed program.
   */
  program: SparkProgram;
  /**
   * The simulated checkpoint for the new program.
   */
  checkpoint?: string;
}

export class CompileProgramMessage {
  static readonly method = "compiler/compile";
  static readonly type = new MessageProtocolRequestType<
    CompileProgramMethod,
    CompileProgramParams,
    CompileProgramResult
  >(CompileProgramMessage.method);
}

export namespace CompileProgramMessage {
  export interface Request extends RequestMessage<
    CompileProgramMethod,
    CompileProgramParams,
    CompileProgramResult
  > {}
  export type Response = ResponseMessage<
    CompileProgramMethod,
    CompileProgramResult
  >;
}
