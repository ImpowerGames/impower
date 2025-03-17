import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ConnectedPreviewMethod = typeof ConnectedPreviewMessage.method;

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export class ConnectedPreviewMessage {
  static readonly method = "preview/connected";
  static readonly type = new MessageProtocolNotificationType<
    ConnectedPreviewMethod,
    ConnectedPreviewParams
  >(ConnectedPreviewMessage.method);
}

export namespace ConnectedPreviewMessage {
  export interface Notification
    extends NotificationMessage<
      ConnectedPreviewMethod,
      ConnectedPreviewParams
    > {}
}
