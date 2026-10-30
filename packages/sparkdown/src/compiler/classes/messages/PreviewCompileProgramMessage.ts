import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import type { SimulationFailure } from "../../types/SimulationFailure";
import type { SparkProgram } from "../../types/SparkProgram";

export type PreviewCompileProgramMethod =
  typeof PreviewCompileProgramMessage.method;

export interface PreviewCompileProgramParams {
  root: { uri: string };
  textDocument: { uri: string; version: number };
  contentChanges: TextDocumentContentChangeEvent[];
  startFrom: { file: string; line: number };
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
}

export interface PreviewCompileProgramResult {
  textDocument: { uri: string; version: number };
  program?: SparkProgram;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
  outdated?: boolean;
}

export class PreviewCompileProgramMessage {
  static readonly method = "compiler/previewCompile";
  static readonly type = new MessageProtocolRequestType<
    PreviewCompileProgramMethod,
    PreviewCompileProgramParams,
    PreviewCompileProgramResult
  >(PreviewCompileProgramMessage.method);
}

export namespace PreviewCompileProgramMessage {
  export interface Request extends RequestMessage<
    PreviewCompileProgramMethod,
    PreviewCompileProgramParams,
    PreviewCompileProgramResult
  > {}
  export type Response = ResponseMessage<
    PreviewCompileProgramMethod,
    PreviewCompileProgramResult
  >;
}
