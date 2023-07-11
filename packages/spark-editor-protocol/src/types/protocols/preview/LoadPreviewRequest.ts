import { uuid } from "../../../utils/uuid";
import { RequestMessage } from "../../base/RequestMessage";
import { Range } from "../Range";
import { TextDocumentItem } from "../TextDocumentItem";

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export type LoadPreviewMethod = typeof LoadPreviewRequest.method;

export interface LoadPreviewMessage
  extends RequestMessage<LoadPreviewMethod, LoadPreviewParams> {}

export class LoadPreviewRequest {
  static readonly method = "preview/load";
  static is(obj: any): obj is LoadPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: LoadPreviewParams): LoadPreviewMessage {
    return {
      jsonrpc: "2.0",
      id: uuid(),
      method: this.method,
      params,
    };
  }
}
