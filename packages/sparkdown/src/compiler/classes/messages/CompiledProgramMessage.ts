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
   *
   * Independent of `simulatedPath`: that field says whether the ANSWER is
   * reusable, this one says what to tell the author. A search that found a
   * route but could not replay it to the end is not a definite answer (so no
   * `simulatedPath`) and still has something to say (so a reason).
   */
  simulationFailure?: SimulationFailure;
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
   * Identity of the program the route search ran against, sent with — and only
   * with — `simulatedPath`. A client must confirm it is holding the same program
   * before reusing the answer: a story path string survives edits that change
   * what the story does at it, so the path alone cannot say whether the two
   * sides are talking about the same script.
   *
   * Built from the program's uri and its per-script document versions, NOT from
   * `program.version` — that field means different things on the two sides of
   * the worker boundary (the compiler stamps a document version; the workspace
   * overwrites it with its own per-project counter), so comparing it would
   * disagree on identical programs and agree on different ones.
   */
  simulatedProgramId?: string;
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
