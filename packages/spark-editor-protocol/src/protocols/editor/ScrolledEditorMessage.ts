import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledEditorMethod = typeof ScrolledEditorMessage.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class ScrolledEditorMessage {
  static readonly method = "editor/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledEditorMethod,
    ScrolledEditorParams
  >(ScrolledEditorMessage.method);
}
