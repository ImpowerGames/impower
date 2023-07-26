import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type FocusedEditorMethod = typeof FocusedEditor.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export abstract class FocusedEditor {
  static readonly method = "editor/focused";
  static readonly type = new MessageProtocolNotificationType<
    FocusedEditorMethod,
    FocusedEditorParams
  >(FocusedEditor.method);
}
