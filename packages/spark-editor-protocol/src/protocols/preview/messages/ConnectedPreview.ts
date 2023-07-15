import { NotificationMessage } from "../../../types";

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export type ConnectedPreviewPreviewMethod = typeof ConnectedPreview.method;

export interface ConnectedPreviewNotificationMessage
  extends NotificationMessage<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  > {}

export class ConnectedPreview {
  static readonly method = "preview/connected";
  static isNotification(obj: any): obj is ConnectedPreviewNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: ConnectedPreviewParams
  ): ConnectedPreviewNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
