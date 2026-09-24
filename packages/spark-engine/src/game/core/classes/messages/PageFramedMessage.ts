import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type PageFramedMethod = typeof PageFramedMessage.method;

export interface PageFramedParams {}

/**
 * The page has finished rendering a frame. A game in a worker ticks on it
 * (`installGameWorker`), so what the tick posts reaches a page that is not
 * rendering.
 */
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
