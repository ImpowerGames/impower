import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type BatchElementsMethod = typeof BatchElementsMessage.method;

export interface BatchElementsParams {
  messages: IMessage[];
}

export class BatchElementsMessage {
  static readonly method = "ui/batch";
  static readonly type = new MessageProtocolNotificationType<
    BatchElementsMethod,
    BatchElementsParams
  >(BatchElementsMessage.method);
}

export interface BatchElementsMessageMap extends Record<string, [any, any]> {
  [BatchElementsMessage.method]: [
    ReturnType<typeof BatchElementsMessage.type.notification>,
    undefined,
  ];
}
