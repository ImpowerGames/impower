import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOnPreviewMethod = typeof HoveredOnPreviewMessage.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export namespace HoveredOnPreviewMessage {
  export const method = "preview/hoveredOn";
  export const type = new MessageProtocolNotificationType<
    HoveredOnPreviewMethod,
    HoveredOnPreviewParams
  >(HoveredOnPreviewMessage.method);
}
