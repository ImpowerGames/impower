import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOffPreviewMethod = typeof HoveredOffPreviewMessage.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export namespace HoveredOffPreviewMessage {
  export const method = "preview/hoveredOff";
  export const type = new MessageProtocolNotificationType<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  >(HoveredOffPreviewMessage.method);
}
