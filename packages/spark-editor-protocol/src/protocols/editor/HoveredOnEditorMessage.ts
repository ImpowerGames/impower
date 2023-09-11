import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOnEditorMethod = typeof HoveredOnEditorMessage.method;

export interface HoveredOnEditorParams {
  textDocument: TextDocumentIdentifier;
}

export class HoveredOnEditorMessage {
  static readonly method = "editor/hoveredOn";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOnEditorMethod,
    HoveredOnEditorParams
  >(HoveredOnEditorMessage.method);
}
