import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledPreviewMethod = typeof ScrolledPreviewMessage.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class ScrolledPreviewMessage {
  static readonly method = "preview/scrolled";
  static readonly type = new MessageProtocolNotificationType<
    ScrolledPreviewMethod,
    ScrolledPreviewParams
  >(ScrolledPreviewMessage.method);
}
