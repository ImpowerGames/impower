import type { NotificationMessage } from "../types/NotificationMessage";
import { isNotification } from "../utils/isNotification";

export class MessageProtocolNotificationType<M extends string, P = undefined> {
  constructor(public method: M) {}

  is(obj: unknown): obj is NotificationMessage<M, P> {
    return this.isNotification(obj);
  }

  isNotification(obj: unknown): obj is NotificationMessage<M, P> {
    return isNotification(obj, this.method);
  }

  notification(params: P): NotificationMessage<M, P> {
    return { jsonrpc: "2.0", method: this.method, params };
  }
}
