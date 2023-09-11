import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenPaneMethod = typeof DidOpenPaneMessage.method;

export interface DidOpenPaneParams {
  pane: string;
}

export class DidOpenPaneMessage {
  static readonly method = "window/didOpenPane";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenPaneMethod,
    DidOpenPaneParams
  >(DidOpenPaneMessage.method);
}
