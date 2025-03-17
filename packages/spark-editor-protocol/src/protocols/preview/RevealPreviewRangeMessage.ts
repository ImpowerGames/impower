import { Range, TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RevealPreviewRangeMethod = typeof RevealPreviewRangeMessage.method;

export interface RevealPreviewRangeParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface RevealPreviewRangeResult {}

export class RevealPreviewRangeMessage {
  static readonly method = "preview/revealRange";
  static readonly type = new MessageProtocolRequestType<
    RevealPreviewRangeMethod,
    RevealPreviewRangeParams,
    RevealPreviewRangeResult
  >(RevealPreviewRangeMessage.method);
}

export namespace RevealPreviewRangeMessage {
  export interface Request
    extends RequestMessage<
      RevealPreviewRangeMethod,
      RevealPreviewRangeParams,
      RevealPreviewRangeResult
    > {}
  export interface Response
    extends ResponseMessage<
      RevealPreviewRangeMethod,
      RevealPreviewRangeResult
    > {}
}
