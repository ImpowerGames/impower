import { MessageProtocolNotificationType } from "../../../../core/classes/MessageProtocolNotificationType";
import { ExecutionData } from "../../types/ExecutionData";

export type DidExecuteMethod = typeof DidExecuteMessage.method;

export class DidExecuteMessage {
  static readonly method = "logic/didexecute";
  static readonly type = new MessageProtocolNotificationType<
    DidExecuteMethod,
    ExecutionData
  >(DidExecuteMessage.method);
}

export interface DidExecuteMessageMap extends Record<string, [any, any]> {
  [DidExecuteMessage.method]: [
    ReturnType<typeof DidExecuteMessage.type.notification>,
    undefined
  ];
}
