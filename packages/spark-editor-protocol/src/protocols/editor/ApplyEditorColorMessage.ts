import { Color, Range, TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyEditorColorMethod = typeof ApplyEditorColorMessage.method;

export interface ApplyEditorColorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  text: string;
  color: Color;
}

export interface ApplyEditorColorResult {
  applied: boolean;
  readOnly?: boolean;
}

export class ApplyEditorColorMessage {
  static readonly method = "editor/applyColor";
  static readonly type = new MessageProtocolRequestType<
    ApplyEditorColorMethod,
    ApplyEditorColorParams,
    ApplyEditorColorResult
  >(ApplyEditorColorMessage.method);
}

export namespace ApplyEditorColorMessage {
  export interface Request extends RequestMessage<
    ApplyEditorColorMethod,
    ApplyEditorColorParams,
    ApplyEditorColorResult
  > {}
  export type Response = ResponseMessage<
    ApplyEditorColorMethod,
    ApplyEditorColorResult
  >;
}
