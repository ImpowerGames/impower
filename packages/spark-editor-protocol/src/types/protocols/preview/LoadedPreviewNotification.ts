import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export interface LoadedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export type LoadedPreviewMethod = typeof LoadedPreviewNotification.method;

export interface LoadedPreviewMessage
  extends NotificationMessage<LoadedPreviewMethod, LoadedPreviewParams> {}

export class LoadedPreviewNotification {
  static readonly method = "preview/loaded";
  static is(obj: any): obj is LoadedPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: LoadedPreviewParams): LoadedPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
