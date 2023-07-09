import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type CachePreviewMethod = typeof CachePreview.method;

export interface CachePreviewParams {
  textDocument: TextDocumentIdentifier;
}

export interface CachePreviewMessage
  extends Message<CachePreviewMethod, CachePreviewParams> {}

export class CachePreview {
  static readonly method = "preview/cache";
  static is(obj: any): obj is CachePreviewMessage {
    return obj.method === this.method;
  }
  static message(params: CachePreviewParams): CachePreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
