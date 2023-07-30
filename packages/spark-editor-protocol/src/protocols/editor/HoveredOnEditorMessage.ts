import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOnEditorMethod = typeof HoveredOnEditorMessage.method;

export interface HoveredOnEditorParams {
  textDocument: TextDocumentIdentifier;
}

export namespace HoveredOnEditorMessage {
  export const method = "editor/hoveredOn";
  export const type = new MessageProtocolNotificationType<
    HoveredOnEditorMethod,
    HoveredOnEditorParams
  >(HoveredOnEditorMessage.method);
}
