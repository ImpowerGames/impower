import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedEditorMethod = typeof SelectedEditorMessage.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class SelectedEditorMessage {
  static readonly method = "editor/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedEditorMethod,
    SelectedEditorParams
  >(SelectedEditorMessage.method);
}
