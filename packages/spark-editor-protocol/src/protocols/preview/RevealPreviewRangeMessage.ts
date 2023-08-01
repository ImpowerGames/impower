import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RevealPreviewRangeMethod = typeof RevealPreviewRangeMessage.method;

export interface RevealPreviewRangeParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export namespace RevealPreviewRangeMessage {
  export const method = "preview/revealRange";
  export const type = new MessageProtocolRequestType<
    RevealPreviewRangeMethod,
    RevealPreviewRangeParams,
    null
  >(RevealPreviewRangeMessage.method);
}
