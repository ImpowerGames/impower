import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type InitializedMethod = typeof InitializedMessage.method;

export interface InitializedParams {}

export class InitializedMessage {
  static readonly method = "game/initialized";
  static readonly type = new MessageProtocolNotificationType<
    InitializedMethod,
    InitializedParams
  >(InitializedMessage.method);
}

export namespace InitializedMessage {
  export interface Notification
    extends NotificationMessage<InitializedMethod, InitializedParams> {}
}
