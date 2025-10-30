import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

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
