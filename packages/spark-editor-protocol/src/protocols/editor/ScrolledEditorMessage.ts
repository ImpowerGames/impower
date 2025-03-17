import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledEditorMethod = typeof ScrolledEditorMessage.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  visibleRange: Range;
  target: string;
}

export class ScrolledEditorMessage {
  static readonly method = "editor/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledEditorMethod,
    ScrolledEditorParams
  >(ScrolledEditorMessage.method);
}

export namespace ScrolledEditorMessage {
  export interface Notification
    extends NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams> {}
}
