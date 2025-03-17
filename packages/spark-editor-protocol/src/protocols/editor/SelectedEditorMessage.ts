import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedEditorMethod = typeof SelectedEditorMessage.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
}

export class SelectedEditorMessage {
  static readonly method = "editor/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedEditorMethod,
    SelectedEditorParams
  >(SelectedEditorMessage.method);
}

export namespace SelectedEditorMessage {
  export interface Notification
    extends NotificationMessage<SelectedEditorMethod, SelectedEditorParams> {}
}
