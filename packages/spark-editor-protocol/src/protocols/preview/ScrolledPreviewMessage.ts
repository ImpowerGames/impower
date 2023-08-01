import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ScrolledPreviewMethod = typeof ScrolledPreviewMessage.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
  target: string;
}

export namespace ScrolledPreviewMessage {
  export const method = "preview/scrolled";
  export const type = new MessageProtocolNotificationType<
    ScrolledPreviewMethod,
    ScrolledPreviewParams
  >(ScrolledPreviewMessage.method);
}
