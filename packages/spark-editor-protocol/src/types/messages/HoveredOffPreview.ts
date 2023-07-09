import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type HoveredOffPreviewMethod = typeof HoveredOffPreview.method;

export interface HoveredOffPreviewParams {
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOffPreviewMessage
  extends Message<HoveredOffPreviewMethod, HoveredOffPreviewParams> {}

export class HoveredOffPreview {
  static readonly method = "preview/hoveredOff";
  static is(obj: any): obj is HoveredOffPreviewMessage {
    return obj.method === this.method;
  }
  static create(params: HoveredOffPreviewParams): HoveredOffPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
