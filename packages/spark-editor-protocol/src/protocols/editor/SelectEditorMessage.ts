import { Range, TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SelectEditorMethod = typeof SelectEditorMessage.method;

export interface SelectEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  scrollIntoView?: "nearest" | "start" | "end" | "center" | false;
  takeFocus?: boolean;
}

export interface SelectEditorResult {}

export class SelectEditorMessage {
  static readonly method = "editor/select";
  static readonly type = new MessageProtocolRequestType<
    SelectEditorMethod,
    SelectEditorParams,
    SelectEditorResult
  >(SelectEditorMessage.method);
}

export namespace SelectEditorMessage {
  export interface Request extends RequestMessage<
    SelectEditorMethod,
    SelectEditorParams,
    SelectEditorResult
  > {}
  export interface Response extends ResponseMessage<
    SelectEditorMethod,
    SelectEditorResult
  > {}
}
