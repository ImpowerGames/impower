import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenViewMethod = typeof DidOpenViewMessage.method;

export interface DidOpenViewParams {
  pane: string;
  view: string;
}

export namespace DidOpenViewMessage {
  export const method = "window/didOpenView";
  export const type = new MessageProtocolNotificationType<
    DidOpenViewMethod,
    DidOpenViewParams
  >(DidOpenViewMessage.method);
}
