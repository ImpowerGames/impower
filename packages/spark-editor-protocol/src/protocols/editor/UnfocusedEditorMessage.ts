import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type UnfocusedEditorMethod = typeof UnfocusedEditorMessage.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export namespace UnfocusedEditorMessage {
  export const method = "editor/unfocused";
  export const type = new MessageProtocolNotificationType<
    UnfocusedEditorMethod,
    UnfocusedEditorParams
  >(UnfocusedEditorMessage.method);
}
