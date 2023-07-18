import { NotificationMessage, TextDocumentIdentifier } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type UnfocusedEditorMethod = typeof UnfocusedEditor.type.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface UnfocusedEditorNotificationMessage
  extends NotificationMessage<UnfocusedEditorMethod, UnfocusedEditorParams> {}

class UnfocusedEditorProtocolType extends NotificationProtocolType<
  UnfocusedEditorNotificationMessage,
  UnfocusedEditorParams
> {
  method = "editor/unfocused";
}

export abstract class UnfocusedEditor {
  static readonly type = new UnfocusedEditorProtocolType();
}
