import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type CachedPreviewMethod = typeof CachedPreview.method;

export interface CachedPreviewParams {
  textDocument: TextDocumentIdentifier;
}

export interface CachedPreviewMessage
  extends Message<CachedPreviewMethod, CachedPreviewParams> {}

export class CachedPreview {
  static readonly method = "preview/cached";
  static is(obj: any): obj is CachedPreviewMessage {
    return obj.method === this.method;
  }
  static create(params: CachedPreviewParams): CachedPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
