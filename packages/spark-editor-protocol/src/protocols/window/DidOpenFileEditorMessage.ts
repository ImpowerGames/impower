import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenFileEditorMethod = typeof DidOpenFileEditorMessage.method;

export interface DidOpenFileEditorParams {
  pane: string;
  panel: string;
  filePath: string;
}

export namespace DidOpenFileEditorMessage {
  export const method = "window/didOpenFileEditor";
  export const type = new MessageProtocolNotificationType<
    DidOpenFileEditorMethod,
    DidOpenFileEditorParams
  >(DidOpenFileEditorMessage.method);
}
