import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidUnblockInteractionsMethod =
  typeof DidUnblockInteractionsMessage.method;

export interface DidUnblockInteractionsParams {}

export namespace DidUnblockInteractionsMessage {
  export const method = "window/didUnblockInteractions";
  export const type = new MessageProtocolNotificationType<
    DidUnblockInteractionsMethod,
    DidUnblockInteractionsParams
  >(DidUnblockInteractionsMessage.method);
}
