import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { type SparkProgram } from "../../types/SparkProgram";
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
   * The story path a route search reached a DEFINITE answer about, so that a
   * client resolving the same path from the same program can reuse that answer
   * instead of repeating the search. This matters because the search is
   * expensive enough to freeze a page that runs it inline.
   *
   * Present with a `checkpoint`: the route was found and replayed all the way
   * to this path, and the checkpoint is the story state there.
   *
   * Present with no `checkpoint`: no route to this path exists. Repeating the
   * search costs the same and reaches the same verdict.
   *
   * Absent: nothing definite is known — no search was attempted, or a route was
   * found but replaying it did not reach the path. A client must run its own
   * search (which terminates in the second case, because a route exists), and
   * must not read anything into a `checkpoint` that arrives without this field.
   */
  simulatedPath?: string | null;
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
