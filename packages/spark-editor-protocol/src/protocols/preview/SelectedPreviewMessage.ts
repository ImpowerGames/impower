import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedPreviewMethod = typeof SelectedPreviewMessage.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export namespace SelectedPreviewMessage {
  export const method = "preview/selected";
  export const type = new MessageProtocolNotificationType<
    SelectedPreviewMethod,
    SelectedPreviewParams
  >(SelectedPreviewMessage.method);
}
