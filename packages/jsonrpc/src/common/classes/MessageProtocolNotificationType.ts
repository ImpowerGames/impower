import { NotificationMessage } from "../types/NotificationMessage";
import { isNotification } from "../utils/isNotification";

export class MessageProtocolNotificationType<M extends string, P = undefined> {
  method: string;

  constructor(method: M) {
    this.method = method;
  }

  is(obj: any): obj is NotificationMessage<M, P> {
    return this.isNotification(obj);
  }

  isNotification(obj: any): obj is NotificationMessage<M, P> {
    return isNotification(obj, this.method);
  }

  notification(params: P): NotificationMessage<M, P> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    } as NotificationMessage<M, P>;
  }
}
