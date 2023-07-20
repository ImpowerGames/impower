import { TextDocumentIdentifier } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type UnfocusedEditorMethod = typeof UnfocusedEditor.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export abstract class UnfocusedEditor {
  static readonly method = "editor/unfocused";
  static readonly type = new MessageProtocolNotificationType<
    UnfocusedEditorMethod,
    UnfocusedEditorParams
  >(UnfocusedEditor.method);
}
