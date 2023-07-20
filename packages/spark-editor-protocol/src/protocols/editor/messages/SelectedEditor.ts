import { Range, TextDocumentIdentifier } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type SelectedEditorMethod = typeof SelectedEditor.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class SelectedEditor {
  static readonly method = "editor/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedEditorMethod,
    SelectedEditorParams
  >(SelectedEditor.method);
}
