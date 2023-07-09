import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export interface LoadedScreenplayPreviewParams {
  textDocument: TextDocumentIdentifier;
}

export type LoadedScreenplayPreviewPreviewMethod =
  typeof LoadedScreenplayPreview.method;

export interface LoadedScreenplayPreviewMessage
  extends Message<
    LoadedScreenplayPreviewPreviewMethod,
    LoadedScreenplayPreviewParams
  > {}

export class LoadedScreenplayPreview {
  static readonly method = "preview/screenplay/loaded";
  static is(obj: any): obj is LoadedScreenplayPreviewMessage {
    return obj.method === this.method;
  }
  static message(
    params: LoadedScreenplayPreviewParams
  ): LoadedScreenplayPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
