import { ProtocolNotificationType } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../types";

export class MessageProtocolNotificationType<
  M extends string,
  P = undefined
> extends ProtocolNotificationType<P, void> {
  constructor(method: M) {
    super(method);
  }
  isNotification(obj: any): obj is NotificationMessage<M, P> {
    return obj.method === this.method;
  }
  notification(params: P): NotificationMessage<M, P> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    } as NotificationMessage<M, P>;
  }
}
