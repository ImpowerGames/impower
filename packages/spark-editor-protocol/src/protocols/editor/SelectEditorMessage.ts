import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectEditorMethod = typeof SelectEditorMessage.method;

export interface SelectEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  scrollIntoView?: "nearest" | "start" | "end" | "center" | false;
  takeFocus?: boolean;
}

// Imperative one-way command (host -> editor): "select this range, optionally
// scroll it into view / take focus." It's the editor-leg of the go-to /
// showDocument flow. Deliberately a NOTIFICATION, not a request: the editor
// just acts on it and never replies (an empty-Result ack was never used). The
// imperative name is kept on purpose — the `NotificationType` is what conveys
// "fire-and-forget" (cf. LSP's window/showMessage). Distinct from
// SelectedEditorMessage, which is the editor REPORTING its own selection change.
export class SelectEditorMessage {
  static readonly method = "editor/select";
  static readonly type = new MessageProtocolNotificationType<
    SelectEditorMethod,
    SelectEditorParams
  >(SelectEditorMessage.method);
}

export namespace SelectEditorMessage {
  export interface Notification extends NotificationMessage<
    SelectEditorMethod,
    SelectEditorParams
  > {}
}
