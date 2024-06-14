import { ExecutionData } from "../../../modules/logic/types/ExecutionData";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

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
