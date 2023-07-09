import { Message } from "../Message";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type ScrolledPreviewMethod = typeof ScrolledPreview.method;

export interface ScrolledPreviewParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledPreviewMessage
  extends Message<ScrolledPreviewMethod, ScrolledPreviewParams> {}

export class ScrolledPreview {
  static readonly method = "preview/scrolled";
  static is(obj: any): obj is ScrolledPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: ScrolledPreviewParams): ScrolledPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
