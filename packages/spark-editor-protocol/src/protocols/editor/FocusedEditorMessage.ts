import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type FocusedEditorMethod = typeof FocusedEditorMessage.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export namespace FocusedEditorMessage {
  export const method = "editor/focused";
  export const type = new MessageProtocolNotificationType<
    FocusedEditorMethod,
    FocusedEditorParams
  >(FocusedEditorMessage.method);
}
