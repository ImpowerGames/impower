import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenPanelMethod = typeof DidOpenPanelMessage.method;

export interface DidOpenPanelParams {
  pane: string;
  panel: string;
}

export abstract class DidOpenPanelMessage {
  static readonly method = "window/didOpenPanel";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenPanelMethod,
    DidOpenPanelParams
  >(DidOpenPanelMessage.method);
}
