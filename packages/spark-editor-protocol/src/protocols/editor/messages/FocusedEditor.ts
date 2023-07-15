import { NotificationMessage, TextDocumentIdentifier } from "../../../types";

export type FocusedEditorMethod = typeof FocusedEditor.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface FocusedEditorNotificationMessage
  extends NotificationMessage<FocusedEditorMethod, FocusedEditorParams> {}

export class FocusedEditor {
  static readonly method = "editor/focused";
  static isNotification(obj: any): obj is FocusedEditorNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: FocusedEditorParams
  ): FocusedEditorNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
