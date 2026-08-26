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
   * The story path a route was planned and simulated TO for this selection.
   *
   * Set whenever the search was attempted, whether or not it succeeded, so a
   * client can tell the two outcomes apart: `checkpoint` present means the
   * route was found and replayed, `checkpoint` absent means the search ran and
   * failed. Left undefined when no search was attempted at all.
   *
   * Mirrors the field of the same name on `CompiledProgramParams`.
   */
  simulatedPath?: string | null;
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
