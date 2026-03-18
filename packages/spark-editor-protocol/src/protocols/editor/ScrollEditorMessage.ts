import { Range, TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ScrollEditorMethod = typeof ScrollEditorMessage.method;

export interface ScrollEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  scrollStrategy: "nearest" | "start" | "end" | "center";
}

export interface ScrollEditorResult {}

export class ScrollEditorMessage {
  static readonly method = "editor/scroll";
  static readonly type = new MessageProtocolRequestType<
    ScrollEditorMethod,
    ScrollEditorParams,
    ScrollEditorResult
  >(ScrollEditorMessage.method);
}

export namespace ScrollEditorMessage {
  export interface Request extends RequestMessage<
    ScrollEditorMethod,
    ScrollEditorParams,
    ScrollEditorResult
  > {}
  export interface Response extends ResponseMessage<
    ScrollEditorMethod,
    ScrollEditorResult
  > {}
}
