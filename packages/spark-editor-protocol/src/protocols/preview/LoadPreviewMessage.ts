import { Range, TextDocumentItem } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadPreviewMethod = typeof LoadPreviewMessage.method;

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export namespace LoadPreviewMessage {
  export const method = "preview/load";
  export const type = new MessageProtocolRequestType<
    LoadPreviewMethod,
    LoadPreviewParams,
    null
  >(LoadPreviewMessage.method);
}
