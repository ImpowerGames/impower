import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillUnblockInteractionsMethod =
  typeof WillUnblockInteractionsMessage.method;

export interface WillUnblockInteractionsParams {}

export namespace WillUnblockInteractionsMessage {
  export const method = "window/willUnblockInteractions";
  export const type = new MessageProtocolRequestType<
    WillUnblockInteractionsMethod,
    WillUnblockInteractionsParams,
    null
  >(WillUnblockInteractionsMessage.method);
}
