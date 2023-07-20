import { Range, TextDocumentItem } from "../../../types";
import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type LoadPreviewMethod = typeof LoadPreview.method;

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export abstract class LoadPreview {
  static readonly method = "preview/load";
  static readonly type = new MessageProtocolRequestType<
    LoadPreviewMethod,
    LoadPreviewParams,
    null
  >(LoadPreview.method);
}
