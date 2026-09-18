import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import type { SimulationFailure } from "../../types/SimulationFailure";
import type { SparkProgram } from "../../types/SparkProgram";

export type PreviewCompileProgramMethod =
  typeof PreviewCompileProgramMessage.method;

export interface PreviewCompileProgramParams {
  /** The script to compile the program from (the edited script's main script). */
  root: { uri: string };
  /** The edited script, at the version `contentChanges` are relative to. */
  textDocument: { uri: string; version: number };
  /** The hypothetical edit, applied to a private copy of the script for the
   *  length of this compile and never to the script itself. */
  contentChanges: TextDocumentContentChangeEvent[];
  /** Where the preview shows the hypothetical program. */
  startFrom: { file: string; line: number };
  /** Filled in by the preview worker while the request is handled, as for
   *  `compiler/compile`. */
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
}

export interface PreviewCompileProgramResult {
  /** The edited script, at the version the edit was applied to. */
  textDocument: { uri: string; version: number };
  /** The program compiled from the edited text. Absent when `outdated`. */
  program?: SparkProgram;
  /** The story state at `startFrom`, when the route there was replayed. */
  checkpoint?: string;
  /** Why no checkpoint could be simulated, when there is none. */
  simulationFailure?: SimulationFailure;
  /** The script is no longer at `textDocument.version`, so the edit describes
   *  a document that no longer exists and nothing was compiled. */
  outdated?: boolean;
}

/**
 * Compile the program as it would be if an edit were made, without making it.
 *
 * The edit is applied to the compiler's copy of the script, the program is
 * compiled, and the script is put back before the request returns, so no other
 * request ever sees the edited text. The compile goes through the same
 * incremental pipeline as a real edit, which is what makes the result the
 * program the edit would produce rather than an approximation of it.
 */
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
