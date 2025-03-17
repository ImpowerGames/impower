import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SearchEditorMethod = typeof SearchEditorMessage.method;

export interface SearchEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface SearchEditorResult {}

export class SearchEditorMessage {
  static readonly method = "editor/search";
  static readonly type = new MessageProtocolRequestType<
    SearchEditorMethod,
    SearchEditorParams,
    SearchEditorResult
  >(SearchEditorMessage.method);
}

export namespace SearchEditorMessage {
  export interface Request
    extends RequestMessage<
      SearchEditorMethod,
      SearchEditorParams,
      SearchEditorResult
    > {}
  export interface Response
    extends ResponseMessage<SearchEditorMethod, SearchEditorResult> {}
}
