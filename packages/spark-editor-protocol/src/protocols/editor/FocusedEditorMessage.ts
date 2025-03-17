import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type FocusedEditorMethod = typeof FocusedEditorMessage.method;

export interface FocusedEditorParams {
  textDocument: TextDocumentIdentifier;
}

export class FocusedEditorMessage {
  static readonly method = "editor/focused";
  static readonly type = new MessageProtocolNotificationType<
    FocusedEditorMethod,
    FocusedEditorParams
  >(FocusedEditorMessage.method);
}

export namespace FocusedEditorMessage {
  export interface Notification
    extends NotificationMessage<FocusedEditorMethod, FocusedEditorParams> {}
}
