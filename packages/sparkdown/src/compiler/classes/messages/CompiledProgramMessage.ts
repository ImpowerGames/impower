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
   * The story path a route was planned and simulated TO for this compile.
   *
   * Set whenever the search was attempted, whether or not it succeeded, so a
   * client can tell the two outcomes apart: `checkpoint` present means the
   * route was found and replayed, `checkpoint` absent means the search ran and
   * failed. Left undefined when no search was attempted at all (no start point,
   * or a host that does not simulate routes off the main thread).
   *
   * A client that resolves the SAME path from the same program is looking at
   * the same search, so it can reuse this outcome instead of repeating the work
   * — which is the whole point: the search is expensive enough to freeze a page
   * that runs it inline.
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
