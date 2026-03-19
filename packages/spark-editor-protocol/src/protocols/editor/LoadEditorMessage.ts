import { Range, TextDocumentItem } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { InitializeParams, InitializeResult } from "../InitializeMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadEditorMethod = typeof LoadEditorMessage.method;

export interface LoadEditorParams {
  textDocument: TextDocumentItem;
  focused?: boolean;
  visibleRange?: Range | "nearest" | "start" | "end" | "center";
  selectedRange?: Range;
  breakpointLines?: number[];
  pinpointLines?: number[];
  highlightLines?: number[];
  languageServerInitializeParams: InitializeParams;
  languageServerInitializeResult: InitializeResult;
  preserveEditor?: boolean;
}

export interface LoadEditorResult {}

export class LoadEditorMessage {
  static readonly method = "editor/load";
  static readonly type = new MessageProtocolRequestType<
    LoadEditorMethod,
    LoadEditorParams,
    LoadEditorResult
  >(LoadEditorMessage.method);
}

export namespace LoadEditorMessage {
  export interface Request extends RequestMessage<
    LoadEditorMethod,
    LoadEditorParams,
    LoadEditorResult
  > {}
  export interface Response extends ResponseMessage<
    LoadEditorMethod,
    LoadEditorResult
  > {}
}
