import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";

export type SelectedPreviewMethod = typeof SelectedPreview.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedPreviewNotificationMessage
  extends NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams> {}

export class SelectedPreview {
  static readonly method = "preview/selected";
  static isNotification(obj: any): obj is SelectedPreviewNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: SelectedPreviewParams
  ): SelectedPreviewNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
