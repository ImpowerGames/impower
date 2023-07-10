import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type FocusedEditorMethod = typeof FocusedEditorNotification.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface FocusedEditorMessage
  extends NotificationMessage<FocusedEditorMethod, FocusedEditorParams> {}

export class FocusedEditorNotification {
  static readonly method = "editor/focused";
  static is(obj: any): obj is FocusedEditorMessage {
    return obj.method === this.method;
  }
  static message(params: FocusedEditorParams): FocusedEditorMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
