import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type RemovedCompilerFileMethod =
  typeof RemovedCompilerFileMessage.method;

export interface RemovedCompilerFileParams {
  textDocument: { uri: string };
}

export class RemovedCompilerFileMessage {
  static readonly method = "compiler/didRemove";
  static readonly type = new MessageProtocolNotificationType<
    RemovedCompilerFileMethod,
    RemovedCompilerFileParams
  >(RemovedCompilerFileMessage.method);
}

export namespace RemovedCompilerFileMessage {
  export interface Notification extends NotificationMessage<
    RemovedCompilerFileMethod,
    RemovedCompilerFileParams
  > {}
}
