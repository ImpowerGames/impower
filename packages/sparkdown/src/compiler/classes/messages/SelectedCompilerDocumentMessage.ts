import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { Range } from "../../types/SparkDiagnostic";

export type SelectedCompilerDocumentMethod =
  typeof SelectedCompilerDocumentMessage.method;

export interface SelectedCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
}

export class SelectedCompilerDocumentMessage {
  static readonly method = "compiler/didSelect";
  static readonly type = new MessageProtocolNotificationType<
    SelectedCompilerDocumentMethod,
    SelectedCompilerDocumentParams
  >(SelectedCompilerDocumentMessage.method);
}

export namespace SelectedCompilerDocumentMessage {
  export interface Notification
    extends NotificationMessage<
      SelectedCompilerDocumentMethod,
      SelectedCompilerDocumentParams
    > {}
}
