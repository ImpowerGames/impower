import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledEditorMethod = typeof ScrolledEditor.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class ScrolledEditor {
  static readonly method = "editor/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledEditorMethod,
    ScrolledEditorParams
  >(ScrolledEditor.method);
}
