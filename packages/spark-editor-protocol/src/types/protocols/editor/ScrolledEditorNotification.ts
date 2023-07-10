import { NotificationMessage } from "../../base/NotificationMessage";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type ScrolledEditorMethod = typeof ScrolledEditorNotification.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledEditorMessage
  extends NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams> {}

export class ScrolledEditorNotification {
  static readonly method = "editor/scrolled";
  static is(obj: any): obj is ScrolledEditorMessage {
    return obj.method === this.method;
  }
  static message(params: ScrolledEditorParams): ScrolledEditorMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
