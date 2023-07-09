import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type UnfocusedEditorMethod = typeof UnfocusedEditor.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface UnfocusedEditorMessage
  extends Message<UnfocusedEditorMethod, UnfocusedEditorParams> {}

export class UnfocusedEditor {
  static readonly method = "editor/unfocused";
  static is(obj: any): obj is UnfocusedEditorMessage {
    return obj.method === this.method;
  }
  static create(params: UnfocusedEditorParams): UnfocusedEditorMessage {
    return {
      method: this.method,
      params,
    };
  }
}
