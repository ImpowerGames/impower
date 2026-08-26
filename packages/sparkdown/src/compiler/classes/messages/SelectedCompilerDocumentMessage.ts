import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { Range } from "../../types/SparkDiagnostic";

export type SelectedCompilerDocumentMethod =
  typeof SelectedCompilerDocumentMessage.method;

export interface SelectedCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  /**
   * The story path a route search reached a DEFINITE answer about for this
   * selection: present with a `checkpoint` means the route was found and
   * replayed to this path and the checkpoint is the story state there; present
   * with no `checkpoint` means no route to this path exists; absent means
   * nothing definite is known and a client must run its own search.
   *
   * Mirrors the field of the same name on `CompiledProgramParams`, where the
   * reasoning is spelled out.
   */
  simulatedPath?: string | null;
  /**
   * Identity of the program the route search ran against, sent with — and only
   * with — `simulatedPath`, and required to match before the answer is reused.
   * Mirrors the field of the same name on `CompiledProgramParams`, where the
   * reasoning is spelled out.
   */
  simulatedProgramId?: string;
}

export class SelectedCompilerDocumentMessage {
  static readonly method = "compiler/didSelect";
  static readonly type = new MessageProtocolNotificationType<
    SelectedCompilerDocumentMethod,
    SelectedCompilerDocumentParams
  >(SelectedCompilerDocumentMessage.method);
}

export namespace SelectedCompilerDocumentMessage {
  export interface Notification extends NotificationMessage<
    SelectedCompilerDocumentMethod,
    SelectedCompilerDocumentParams
  > {}
}
