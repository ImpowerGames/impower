import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type UnfocusedEditorMethod = typeof UnfocusedEditorMessage.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export class UnfocusedEditorMessage {
  static readonly method = "editor/unfocused";
  static readonly type = new MessageProtocolNotificationType<
    UnfocusedEditorMethod,
    UnfocusedEditorParams
  >(UnfocusedEditorMessage.method);
}
