import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillBlockInteractionsMethod =
  typeof WillBlockInteractionsMessage.method;

export interface WillBlockInteractionsParams {}

export namespace WillBlockInteractionsMessage {
  export const method = "window/willBlockInteractions";
  export const type = new MessageProtocolRequestType<
    WillBlockInteractionsMethod,
    WillBlockInteractionsParams,
    null
  >(WillBlockInteractionsMessage.method);
}
