import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
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

export namespace HoveredOffEditorMessage {
  export interface Notification
    extends NotificationMessage<
      HoveredOffEditorMethod,
      HoveredOffEditorParams
    > {}
}
