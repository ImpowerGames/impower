import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { type SparkProgram } from "../../types/SparkProgram";
import { SimulationFailure } from "../../types/SimulationFailure";
import { VersionedTextDocumentIdentifier } from "../../types/VersionedTextDocumentIdentifier";

export type CompiledProgramMethod = typeof CompiledProgramMessage.method;

/**
 * Per-file rollup of diagnostic counts by severity. Enough for a client to
 * badge/color a file (error = red, warning = yellow) without shipping the
 * diagnostics themselves — full diagnostics reach editor views separately via
 * `textDocument/publishDiagnostics`.
 */
export type DiagnosticsSummary = Record<
  string,
  { errors: number; warnings: number; infos: number }
>;

export interface CompiledProgramParams {
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
  /**
   * Why no checkpoint could be simulated, when there is none. Set instead of
   * `checkpoint`, never alongside it — the player shows the row as failed
   * whenever it is handed no checkpoint, and this is what lets it say why.
   */
  simulationFailure?: SimulationFailure;
  /**
   * Per-file diagnostic counts. Populated (and `program.diagnostics` omitted)
   * when the workspace is initialized with `slimProgramNotifications`.
   */
  diagnosticsSummary?: DiagnosticsSummary;
}

export class CompiledProgramMessage {
  static readonly method = "compiler/didCompile";
  static readonly type = new MessageProtocolNotificationType<
    CompiledProgramMethod,
    CompiledProgramParams
  >(CompiledProgramMessage.method);
}

export namespace CompiledProgramMessage {
  export interface Notification extends NotificationMessage<
    CompiledProgramMethod,
    CompiledProgramParams
  > {}
}
