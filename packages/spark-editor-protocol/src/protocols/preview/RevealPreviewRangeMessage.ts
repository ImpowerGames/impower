import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RevealPreviewRangeMethod = typeof RevealPreviewRangeMessage.method;

export interface RevealPreviewRangeParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export class RevealPreviewRangeMessage {
  static readonly method = "preview/revealRange";
  static readonly type = new MessageProtocolRequestType<
    RevealPreviewRangeMethod,
    RevealPreviewRangeParams,
    null
  >(RevealPreviewRangeMessage.method);
}
