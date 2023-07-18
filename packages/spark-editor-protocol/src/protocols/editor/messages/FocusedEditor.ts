import { NotificationMessage, TextDocumentIdentifier } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type FocusedEditorMethod = typeof FocusedEditor.type.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface FocusedEditorNotificationMessage
  extends NotificationMessage<FocusedEditorMethod, FocusedEditorParams> {}

class FocusedEditorProtocolType extends NotificationProtocolType<
  FocusedEditorNotificationMessage,
  FocusedEditorParams
> {
  method = "editor/focused";
}

export abstract class FocusedEditor {
  static readonly type = new FocusedEditorProtocolType();
}
