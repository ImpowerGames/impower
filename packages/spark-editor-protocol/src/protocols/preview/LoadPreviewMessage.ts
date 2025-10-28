import { Range, TextDocumentItem } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadPreviewMethod = typeof LoadPreviewMessage.method;

export interface LoadPreviewParams {
  type: "screenplay";
  textDocument: TextDocumentItem;
  focused?: boolean;
  visibleRange?: Range;
  selectedRange?: Range;
}

export interface LoadPreviewResult {}

export class LoadPreviewMessage {
  static readonly method = "preview/load";
  static readonly type = new MessageProtocolRequestType<
    LoadPreviewMethod,
    LoadPreviewParams,
    LoadPreviewResult
  >(LoadPreviewMessage.method);
}

export namespace LoadPreviewMessage {
  export interface Request
    extends RequestMessage<
      LoadPreviewMethod,
      LoadPreviewParams,
      LoadPreviewResult
    > {}
  export interface Response
    extends ResponseMessage<LoadPreviewMethod, LoadPreviewResult> {}
}
