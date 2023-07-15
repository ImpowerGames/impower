import {
  Range,
  RequestMessage,
  ResponseMessage,
  TextDocumentItem,
} from "../../../types";
import { uuid } from "../../../utils/uuid";

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export type LoadPreviewMethod = typeof LoadPreview.method;

export interface LoadPreviewRequestMessage
  extends RequestMessage<LoadPreviewMethod, LoadPreviewParams> {
  params: LoadPreviewParams;
}

export interface LoadPreviewResponseMessage
  extends ResponseMessage<LoadPreviewMethod, null> {}

export class LoadPreview {
  static readonly method = "preview/load";
  static isRequest(obj: any): obj is LoadPreviewRequestMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static isResponse(obj: any): obj is LoadPreviewResponseMessage {
    return obj.method === this.method && obj.result !== undefined;
  }
  static request(params: LoadPreviewParams): LoadPreviewRequestMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    };
  }
  static response(id: number | string): LoadPreviewResponseMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result: null,
    };
  }
}
