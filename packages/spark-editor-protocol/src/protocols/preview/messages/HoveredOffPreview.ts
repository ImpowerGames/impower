import { NotificationMessage, TextDocumentIdentifier } from "../../../types";

export type HoveredOffPreviewMethod = typeof HoveredOffPreview.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOffPreviewNotificationMessage
  extends NotificationMessage<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  > {}

export class HoveredOffPreview {
  static readonly method = "preview/hoveredOff";
  static isNotification(obj: any): obj is HoveredOffPreviewNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: HoveredOffPreviewParams
  ): HoveredOffPreviewNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
