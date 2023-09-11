import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenViewMethod = typeof DidOpenViewMessage.method;

export interface DidOpenViewParams {
  pane: string;
  view: string;
}

export class DidOpenViewMessage {
  static readonly method = "window/didOpenView";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenViewMethod,
    DidOpenViewParams
  >(DidOpenViewMessage.method);
}
