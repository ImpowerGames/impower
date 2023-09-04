import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidBlockInteractionsMethod =
  typeof DidBlockInteractionsMessage.method;

export interface DidBlockInteractionsParams {}

export namespace DidBlockInteractionsMessage {
  export const method = "window/didBlockInteractions";
  export const type = new MessageProtocolNotificationType<
    DidBlockInteractionsMethod,
    DidBlockInteractionsParams
  >(DidBlockInteractionsMessage.method);
}
