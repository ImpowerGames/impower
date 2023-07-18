import { NotificationMessage } from "../types";

export abstract class NotificationProtocolType<
  Notification extends NotificationMessage,
  Params = undefined
> {
  abstract get method(): string;
  isNotification(obj: any): obj is Notification {
    return obj.method === this.method;
  }
  notification(params: Params): Notification {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    } as Notification;
  }
}
