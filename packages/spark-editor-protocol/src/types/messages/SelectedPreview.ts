import { Message } from "../Message";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type SelectedPreviewMethod = typeof SelectedPreview.method;

export interface SelectedPreviewParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedPreviewMessage
  extends Message<SelectedPreviewMethod, SelectedPreviewParams> {}

export class SelectedPreview {
  static readonly method = "preview/selected";
  static is(obj: any): obj is SelectedPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: SelectedPreviewParams): SelectedPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
