import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOffPreviewMethod = typeof HoveredOffPreview.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export abstract class HoveredOffPreview {
  static readonly method = "preview/hoveredOff";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  >(HoveredOffPreview.method);
}
