import { Range, TextDocumentIdentifier } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type ScrolledPreviewMethod = typeof ScrolledPreview.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class ScrolledPreview {
  static readonly method = "preview/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledPreviewMethod,
    ScrolledPreviewParams
  >(ScrolledPreview.method);
}
