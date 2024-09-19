import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SearchEditorMethod = typeof SearchEditorMessage.method;

export interface SearchEditorParams {
  textDocument: TextDocumentIdentifier;
}

export class SearchEditorMessage {
  static readonly method = "editor/search";
  static readonly type = new MessageProtocolRequestType<
    SearchEditorMethod,
    SearchEditorParams,
    null
  >(SearchEditorMessage.method);
}
