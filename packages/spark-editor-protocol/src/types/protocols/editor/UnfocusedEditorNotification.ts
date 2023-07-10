import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type UnfocusedEditorMethod = typeof UnfocusedEditorNotification.method;

export interface UnfocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export interface UnfocusedEditorMessage
  extends NotificationMessage<UnfocusedEditorMethod, UnfocusedEditorParams> {}

export class UnfocusedEditorNotification {
  static readonly method = "editor/unfocused";
  static is(obj: any): obj is UnfocusedEditorMessage {
    return obj.method === this.method;
  }
  static message(params: UnfocusedEditorParams): UnfocusedEditorMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
