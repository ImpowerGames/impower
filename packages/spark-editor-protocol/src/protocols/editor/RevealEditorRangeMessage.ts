import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RevealEditorRangeMethod = typeof RevealEditorRangeMessage.method;

export interface RevealEditorRangeParams {
  textDocument: TextDocumentIdentifier;
  visibleRange?: Range;
  selectedRange?: Range;
}

export namespace RevealEditorRangeMessage {
  export const method = "editor/revealRange";
  export const type = new MessageProtocolRequestType<
    RevealEditorRangeMethod,
    RevealEditorRangeParams,
    null
  >(RevealEditorRangeMessage.method);
}
