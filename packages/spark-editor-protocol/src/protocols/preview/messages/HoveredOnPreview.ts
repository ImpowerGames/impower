import { NotificationMessage, TextDocumentIdentifier } from "../../../types";

export type HoveredOnPreviewMethod = typeof HoveredOnPreview.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOnPreviewNotificationMessage
  extends NotificationMessage<HoveredOnPreviewMethod, HoveredOnPreviewParams> {}

export class HoveredOnPreview {
  static readonly method = "preview/hoveredOn";
  static isNotification(obj: any): obj is HoveredOnPreviewNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: HoveredOnPreviewParams
  ): HoveredOnPreviewNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
