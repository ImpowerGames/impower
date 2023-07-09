import { Message } from "../Message";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type ScrolledEditorMethod = typeof ScrolledEditor.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledEditorMessage
  extends Message<ScrolledEditorMethod, ScrolledEditorParams> {}

export class ScrolledEditor {
  static readonly method = "editor/scrolled";
  static is(obj: any): obj is ScrolledEditorMessage {
    return obj.method === this.method;
  }
  static message(params: ScrolledEditorParams): ScrolledEditorMessage {
    return {
      method: this.method,
      params,
    };
  }
}
