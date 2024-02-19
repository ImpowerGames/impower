import { MessageProtocolNotificationType } from "../../../../core/classes/MessageProtocolNotificationType";
import { ExecutionData } from "../../types/ExecutionData";

export type WillExecuteMethod = typeof WillExecuteMessage.method;

export class WillExecuteMessage {
  static readonly method = "logic/willexecute";
  static readonly type = new MessageProtocolNotificationType<
    WillExecuteMethod,
    ExecutionData
  >(WillExecuteMessage.method);
}

export interface WillExecuteMessageMap extends Record<string, [any, any]> {
  [WillExecuteMessage.method]: [
    ReturnType<typeof WillExecuteMessage.type.notification>,
    undefined
  ];
}
