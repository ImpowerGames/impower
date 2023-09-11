import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenFileEditorMethod = typeof DidOpenFileEditorMessage.method;

export interface DidOpenFileEditorParams {
  pane: string;
  panel: string;
  filename: string;
}

export class DidOpenFileEditorMessage {
  static readonly method = "window/didOpenFileEditor";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenFileEditorMethod,
    DidOpenFileEditorParams
  >(DidOpenFileEditorMessage.method);
}
