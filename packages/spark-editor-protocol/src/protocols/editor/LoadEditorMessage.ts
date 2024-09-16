import { Range, ServerCapabilities, TextDocumentItem } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadEditorMethod = typeof LoadEditorMessage.method;

export interface LoadEditorParams {
  textDocument: TextDocumentItem;
  focused?: boolean;
  visibleRange?: Range;
  selectedRange?: Range;
  breakpointRanges?: Range[];
  languageServerCapabilities: ServerCapabilities;
}

export class LoadEditorMessage {
  static readonly method = "editor/load";
  static readonly type = new MessageProtocolRequestType<
    LoadEditorMethod,
    LoadEditorParams,
    null
  >(LoadEditorMessage.method);
}
