import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenPaneMethod = typeof DidOpenPaneMessage.method;

export interface DidOpenPaneParams {
  pane: string;
}

export namespace DidOpenPaneMessage {
  export const method = "window/didOpenPane";
  export const type = new MessageProtocolNotificationType<
    DidOpenPaneMethod,
    DidOpenPaneParams
  >(DidOpenPaneMessage.method);
}
