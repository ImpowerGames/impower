import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";

export type ScrolledPreviewMethod = typeof ScrolledPreview.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledPreviewNotificationMessage
  extends NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams> {}

export class ScrolledPreview {
  static readonly method = "preview/scrolled";
  static isNotification(obj: any): obj is ScrolledPreviewNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: ScrolledPreviewParams
  ): ScrolledPreviewNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
