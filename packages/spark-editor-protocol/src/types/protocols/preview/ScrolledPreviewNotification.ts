import { NotificationMessage } from "../../base/NotificationMessage";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type ScrolledPreviewMethod = typeof ScrolledPreviewNotification.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledPreviewMessage
  extends NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams> {}

export class ScrolledPreviewNotification {
  static readonly method = "preview/scrolled";
  static is(obj: any): obj is ScrolledPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: ScrolledPreviewParams): ScrolledPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
