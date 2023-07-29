import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseFileEditorMethod = typeof DidCloseFileEditorMessage.method;

export interface DidCloseFileEditorParams {
  pane: string;
  panel: string;
}

export namespace DidCloseFileEditorMessage {
  export const method = "window/didCloseFileEditor";
  export const type = new MessageProtocolNotificationType<
    DidCloseFileEditorMethod,
    DidCloseFileEditorParams
  >(DidCloseFileEditorMessage.method);
}
