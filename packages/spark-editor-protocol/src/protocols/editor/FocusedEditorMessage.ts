import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type FocusedEditorMethod = typeof FocusedEditorMessage.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export abstract class FocusedEditorMessage {
  static readonly method = "editor/focused";
  static readonly type = new MessageProtocolNotificationType<
    FocusedEditorMethod,
    FocusedEditorParams
  >(FocusedEditorMessage.method);
}
