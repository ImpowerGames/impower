import { Range, TextDocumentItem } from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadEditorMethod = typeof LoadEditor.method;

export interface LoadEditorParams {
  textDocument: TextDocumentItem;
  visibleRange?: Range;
  selectedRange?: Range;
}

export abstract class LoadEditor {
  static readonly method = "editor/load";
  static readonly type = new MessageProtocolRequestType<
    LoadEditorMethod,
    LoadEditorParams,
    null
  >(LoadEditor.method);
}
