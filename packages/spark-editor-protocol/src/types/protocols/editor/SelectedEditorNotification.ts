import { NotificationMessage } from "../../base/NotificationMessage";
import { Range } from "../Range";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type SelectedEditorMethod = typeof SelectedEditorNotification.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedEditorMessage
  extends NotificationMessage<SelectedEditorMethod, SelectedEditorParams> {}

export class SelectedEditorNotification {
  static readonly method = "editor/selected";
  static is(obj: any): obj is SelectedEditorMessage {
    return obj.method === this.method;
  }
  static message(params: SelectedEditorParams): SelectedEditorMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
