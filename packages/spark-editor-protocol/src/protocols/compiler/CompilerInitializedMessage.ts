import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type CompilerInitializedMethod =
  typeof CompilerInitializedMessage.method;

export interface CompilerInitializedParams {}

export class CompilerInitializedMessage {
  static readonly method = "compiler/initialized";
  static readonly type = new MessageProtocolNotificationType<
    CompilerInitializedMethod,
    CompilerInitializedParams
  >(CompilerInitializedMessage.method);
}

export namespace CompilerInitializedMessage {
  export interface Notification
    extends NotificationMessage<
      CompilerInitializedMethod,
      CompilerInitializedParams
    > {}
}
