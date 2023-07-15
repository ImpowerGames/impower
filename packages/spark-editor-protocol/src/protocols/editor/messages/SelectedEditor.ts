import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";

export type SelectedEditorMethod = typeof SelectedEditor.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedEditorNotificationMessage
  extends NotificationMessage<SelectedEditorMethod, SelectedEditorParams> {}

export class SelectedEditor {
  static readonly method = "editor/selected";
  static isNotification(obj: any): obj is SelectedEditorNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: SelectedEditorParams
  ): SelectedEditorNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
