import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOffPreviewMethod = typeof HoveredOffPreviewMessage.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export abstract class HoveredOffPreviewMessage {
  static readonly method = "preview/hoveredOff";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  >(HoveredOffPreviewMessage.method);
}