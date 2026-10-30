import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type PageFramedMethod = typeof PageFramedMessage.method;

export interface PageFramedParams {}

export class PageFramedMessage {
  static readonly method = "game/pageFramed";
  static readonly type = new MessageProtocolNotificationType<
    PageFramedMethod,
    PageFramedParams
  >(PageFramedMessage.method);
}

export namespace PageFramedMessage {
  export interface Notification extends NotificationMessage<
    PageFramedMethod,
    PageFramedParams
  > {}
}
