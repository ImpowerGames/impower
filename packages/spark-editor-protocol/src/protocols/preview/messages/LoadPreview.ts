import {
  Range,
  RequestMessage,
  ResponseMessage,
  TextDocumentItem,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export type LoadPreviewMethod = typeof LoadPreview.type.method;

export interface LoadPreviewRequestMessage
  extends RequestMessage<LoadPreviewMethod, LoadPreviewParams> {
  params: LoadPreviewParams;
}

export interface LoadPreviewResponseMessage
  extends ResponseMessage<LoadPreviewMethod, null> {}

class LoadPreviewProtocolType extends RequestProtocolType<
  LoadPreviewRequestMessage,
  LoadPreviewResponseMessage,
  LoadPreviewParams
> {
  method = "preview/load";
}

export abstract class LoadPreview {
  static readonly type = new LoadPreviewProtocolType();
}
