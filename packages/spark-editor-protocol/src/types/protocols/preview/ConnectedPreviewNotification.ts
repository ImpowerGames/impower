import { NotificationMessage } from "../../base/NotificationMessage";

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export type ConnectedPreviewPreviewMethod =
  typeof ConnectedPreviewNotification.method;

export interface ConnectedPreviewMessage
  extends NotificationMessage<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  > {}

export class ConnectedPreviewNotification {
  static readonly method = "preview/connected";
  static is(obj: any): obj is ConnectedPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: ConnectedPreviewParams): ConnectedPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
