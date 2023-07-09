import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type FocusedEditorMethod = typeof FocusedEditor.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface FocusedEditorMessage
  extends Message<FocusedEditorMethod, FocusedEditorParams> {}

export class FocusedEditor {
  static readonly method = "editor/focused";
  static is(obj: any): obj is FocusedEditorMessage {
    return obj.method === this.method;
  }
  static message(params: FocusedEditorParams): FocusedEditorMessage {
    return {
      method: this.method,
      params,
    };
  }
}
