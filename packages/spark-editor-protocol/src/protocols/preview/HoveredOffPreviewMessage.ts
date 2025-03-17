import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOffPreviewMethod = typeof HoveredOffPreviewMessage.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export class HoveredOffPreviewMessage {
  static readonly method = "preview/hoveredOff";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  >(HoveredOffPreviewMessage.method);
}

export namespace HoveredOffPreviewMessage {
  export interface Notification
    extends NotificationMessage<
      HoveredOffPreviewMethod,
      HoveredOffPreviewParams
    > {}
}
