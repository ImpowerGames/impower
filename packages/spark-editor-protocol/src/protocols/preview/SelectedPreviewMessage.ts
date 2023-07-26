import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedPreviewMethod = typeof SelectedPreviewMessage.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class SelectedPreviewMessage {
  static readonly method = "preview/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedPreviewMethod,
    SelectedPreviewParams
  >(SelectedPreviewMessage.method);
}
