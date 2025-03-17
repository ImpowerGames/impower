import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledPreviewMethod = typeof ScrolledPreviewMessage.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  visibleRange: Range;
  target: string;
}

export class ScrolledPreviewMessage {
  static readonly method = "preview/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledPreviewMethod,
    ScrolledPreviewParams
  >(ScrolledPreviewMessage.method);
}

export namespace ScrolledPreviewMessage {
  export interface Notification
    extends NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams> {}
}
