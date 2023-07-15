import { NotificationMessage, TextDocumentIdentifier } from "../../../types";

export type UnfocusedEditorMethod = typeof UnfocusedEditor.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface UnfocusedEditorNotificationMessage
  extends NotificationMessage<UnfocusedEditorMethod, UnfocusedEditorParams> {}

export class UnfocusedEditor {
  static readonly method = "editor/unfocused";
  static isNotification(obj: any): obj is UnfocusedEditorNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: UnfocusedEditorParams
  ): UnfocusedEditorNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
