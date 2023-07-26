import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOnPreviewMethod = typeof HoveredOnPreviewMessage.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export abstract class HoveredOnPreviewMessage {
  static readonly method = "preview/hoveredOn";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOnPreviewMethod,
    HoveredOnPreviewParams
  >(HoveredOnPreviewMessage.method);
}
