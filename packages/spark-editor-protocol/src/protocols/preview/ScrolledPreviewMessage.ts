import { Range, TextDocumentIdentifier } from "../../types";
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
