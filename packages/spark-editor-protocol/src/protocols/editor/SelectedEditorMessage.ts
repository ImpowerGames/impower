import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedEditorMethod = typeof SelectedEditorMessage.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  selectedRange: Range;
  docChanged: boolean;
}

export namespace SelectedEditorMessage {
  export const method = "editor/selected";
  export const type = new MessageProtocolNotificationType<
    SelectedEditorMethod,
    SelectedEditorParams
  >(SelectedEditorMessage.method);
}
