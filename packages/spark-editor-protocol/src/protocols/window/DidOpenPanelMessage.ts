import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenPanelMethod = typeof DidOpenPanelMessage.method;

export interface DidOpenPanelParams {
  pane: string;
  panel: string;
}

export namespace DidOpenPanelMessage {
  export const method = "window/didOpenPanel";
  export const type = new MessageProtocolNotificationType<
    DidOpenPanelMethod,
    DidOpenPanelParams
  >(DidOpenPanelMessage.method);
}
