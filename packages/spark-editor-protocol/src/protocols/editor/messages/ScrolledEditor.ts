import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";

export type ScrolledEditorMethod = typeof ScrolledEditor.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledEditorNotificationMessage
  extends NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams> {}

export class ScrolledEditor {
  static readonly method = "editor/scrolled";
  static isNotification(obj: any): obj is ScrolledEditorNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: ScrolledEditorParams
  ): ScrolledEditorNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
