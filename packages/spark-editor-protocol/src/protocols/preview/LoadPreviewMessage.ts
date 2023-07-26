import { Range, TextDocumentItem } from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadPreviewMethod = typeof LoadPreviewMessage.method;

export interface LoadPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export abstract class LoadPreviewMessage {
  static readonly method = "preview/load";
  static readonly type = new MessageProtocolRequestType<
    LoadPreviewMethod,
    LoadPreviewParams,
    null
  >(LoadPreviewMessage.method);
}
