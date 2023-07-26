import { Range, TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedPreviewMethod = typeof SelectedPreview.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export abstract class SelectedPreview {
  static readonly method = "preview/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedPreviewMethod,
    SelectedPreviewParams
  >(SelectedPreview.method);
}
