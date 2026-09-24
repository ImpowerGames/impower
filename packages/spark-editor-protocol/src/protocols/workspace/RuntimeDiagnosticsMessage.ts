import type { Diagnostic } from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type RuntimeDiagnosticsMethod = typeof RuntimeDiagnosticsMessage.method;

export interface RuntimeDiagnosticsParams {
  /** The program the run was built from: its entry script, and the document
   *  version of each script it was compiled from. The diagnostics describe
   *  those versions, so the language server shows them only while its own
   *  program was compiled from the same ones. */
  program: { uri: string; scripts: Record<string, number> };
  /** Every runtime error and warning the run has raised, by document, each
   *  with source `runtime`. Replaces what the last report said. */
  diagnostics: Record<string, Diagnostic[]>;
}

/**
 * The runtime errors and warnings of the player's current run: PLAY, or the
 * preview at the author's line with the route replayed to it. The player
 * sends the whole set whenever it changes, and the editor hosting it passes
 * it on to the language server, which publishes it beside the compile's
 * diagnostics.
 */
export class RuntimeDiagnosticsMessage {
  static readonly method = "sparkdown/runtimeDiagnostics";
  static readonly type = new MessageProtocolNotificationType<
    RuntimeDiagnosticsMethod,
    RuntimeDiagnosticsParams
  >(RuntimeDiagnosticsMessage.method);
}

export namespace RuntimeDiagnosticsMessage {
  export interface Notification extends NotificationMessage<
    RuntimeDiagnosticsMethod,
    RuntimeDiagnosticsParams
  > {}
}
