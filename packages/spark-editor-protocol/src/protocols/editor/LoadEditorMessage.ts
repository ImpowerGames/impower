import { Range, ServerCapabilities, TextDocumentItem } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadEditorMethod = typeof LoadEditorMessage.method;

export interface LoadEditorParams {
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
  languageServerCapabilities: ServerCapabilities;
}

export namespace LoadEditorMessage {
  export const method = "editor/load";
  export const type = new MessageProtocolRequestType<
    LoadEditorMethod,
    LoadEditorParams,
    null
  >(LoadEditorMessage.method);
}
