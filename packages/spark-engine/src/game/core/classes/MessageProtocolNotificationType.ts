import { NotificationMessage } from "../types/NotificationMessage";

export class MessageProtocolNotificationType<M extends string, P = undefined> {
  method: string;

  constructor(method: M) {
    this.method = method;
  }

  isNotification(obj: any): obj is NotificationMessage<M, P> {
    return obj.method === this.method && obj.id === undefined;
  }

  notification(params: P): NotificationMessage<M, P> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    } as NotificationMessage<M, P>;
  }
}
