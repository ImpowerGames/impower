import { DocumentSource } from "../../types/DocumentSource";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillExecuteMethod = typeof WillExecuteMessage.method;

export class WillExecuteMessage {
  static readonly method = "story/willExecute";
  static readonly type = new MessageProtocolNotificationType<
    WillExecuteMethod,
    { source: DocumentSource }
  >(WillExecuteMessage.method);
}

export interface WillExecuteMessageMap extends Record<string, [any, any]> {
  [WillExecuteMessage.method]: [
    ReturnType<typeof WillExecuteMessage.type.notification>,
    undefined
  ];
}
