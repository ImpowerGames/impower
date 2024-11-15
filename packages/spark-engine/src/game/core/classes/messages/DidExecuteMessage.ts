import { DocumentSource } from "../../types/DocumentSource";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidExecuteMethod = typeof DidExecuteMessage.method;

export class DidExecuteMessage {
  static readonly method = "story/didExecute";
  static readonly type = new MessageProtocolNotificationType<
    DidExecuteMethod,
    { source: DocumentSource }
  >(DidExecuteMessage.method);
}

export interface DidExecuteMessageMap extends Record<string, [any, any]> {
  [DidExecuteMessage.method]: [
    ReturnType<typeof DidExecuteMessage.type.notification>,
    undefined
  ];
}
