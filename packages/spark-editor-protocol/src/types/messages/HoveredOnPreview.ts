import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type HoveredOnPreviewMethod = typeof HoveredOnPreview.method;

export interface HoveredOnPreviewParams {
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOnPreviewMessage
  extends Message<HoveredOnPreviewMethod, HoveredOnPreviewParams> {}

export class HoveredOnPreview {
  static readonly method = "preview/hoveredOn";
  static is(obj: any): obj is HoveredOnPreviewMessage {
    return obj.method === this.method;
  }
  static create(params: HoveredOnPreviewParams): HoveredOnPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
