import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseFileEditorMethod = typeof DidCloseFileEditorMessage.method;

export interface DidCloseFileEditorParams {
  pane: string;
  panel: string;
}

export class DidCloseFileEditorMessage {
  static readonly method = "window/didCloseFileEditor";
  static readonly type = new MessageProtocolNotificationType<
    DidCloseFileEditorMethod,
    DidCloseFileEditorParams
  >(DidCloseFileEditorMessage.method);
}
