import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOffEditorMethod = typeof HoveredOffEditorMessage.method;

export interface HoveredOffEditorParams {
  textDocument: TextDocumentIdentifier;
}

export class HoveredOffEditorMessage {
  static readonly method = "editor/hoveredOff";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOffEditorMethod,
    HoveredOffEditorParams
  >(HoveredOffEditorMessage.method);
}
