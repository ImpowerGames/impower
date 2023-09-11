import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RevealEditorRangeMethod = typeof RevealEditorRangeMessage.method;

export interface RevealEditorRangeParams {
  textDocument: TextDocumentIdentifier;
  visibleRange?: Range;
  selectedRange?: Range;
}

export class RevealEditorRangeMessage {
  static readonly method = "editor/revealRange";
  static readonly type = new MessageProtocolRequestType<
    RevealEditorRangeMethod,
    RevealEditorRangeParams,
    null
  >(RevealEditorRangeMessage.method);
}
