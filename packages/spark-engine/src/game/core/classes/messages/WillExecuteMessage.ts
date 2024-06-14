import { ExecutionData } from "../../../modules/logic/types/ExecutionData";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

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
