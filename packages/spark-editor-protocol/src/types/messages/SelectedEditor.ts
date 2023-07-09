import { Message } from "../Message";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type SelectedEditorMethod = typeof SelectedEditor.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedEditorMessage
  extends Message<SelectedEditorMethod, SelectedEditorParams> {}

export class SelectedEditor {
  static readonly method = "editor/selected";
  static is(obj: any): obj is SelectedEditorMessage {
    return obj.method === this.method;
  }
  static create(params: SelectedEditorParams): SelectedEditorMessage {
    return {
      method: this.method,
      params,
    };
  }
}
