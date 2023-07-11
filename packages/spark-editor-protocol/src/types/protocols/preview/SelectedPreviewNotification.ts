import { NotificationMessage } from "../../base/NotificationMessage";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type SelectedPreviewMethod = typeof SelectedPreviewNotification.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedPreviewMessage
  extends NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams> {}

export class SelectedPreviewNotification {
  static readonly method = "preview/selected";
  static is(obj: any): obj is SelectedPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: SelectedPreviewParams): SelectedPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
