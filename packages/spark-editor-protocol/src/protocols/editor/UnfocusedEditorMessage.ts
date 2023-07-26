import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type UnfocusedEditorMethod = typeof UnfocusedEditorMessage.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export abstract class UnfocusedEditorMessage {
  static readonly method = "editor/unfocused";
  static readonly type = new MessageProtocolNotificationType<
    UnfocusedEditorMethod,
    UnfocusedEditorParams
  >(UnfocusedEditorMessage.method);
}
