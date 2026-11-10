import { Range, VersionedTextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorWithheldDiagnosticMethod =
  typeof ChangedEditorWithheldDiagnosticMessage.method;

export interface ChangedEditorWithheldDiagnosticParams {
  textDocument: VersionedTextDocumentIdentifier;
  range: Range | null;
  edited?: boolean;
}

export class ChangedEditorWithheldDiagnosticMessage {
  static readonly method = "editor/withheldDiagnosticChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorWithheldDiagnosticMethod,
    ChangedEditorWithheldDiagnosticParams
  >(ChangedEditorWithheldDiagnosticMessage.method);
}

export namespace ChangedEditorWithheldDiagnosticMessage {
  export interface Notification extends NotificationMessage<
    ChangedEditorWithheldDiagnosticMethod,
    ChangedEditorWithheldDiagnosticParams
  > {}
}
