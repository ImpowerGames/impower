import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HoveredOnPreviewMethod = typeof HoveredOnPreviewMessage.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export class HoveredOnPreviewMessage {
  static readonly method = "preview/hoveredOn";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOnPreviewMethod,
    HoveredOnPreviewParams
  >(HoveredOnPreviewMessage.method);
}

export namespace HoveredOnPreviewMessage {
  export interface Notification
    extends NotificationMessage<
      HoveredOnPreviewMethod,
      HoveredOnPreviewParams
    > {}
}
