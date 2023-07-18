import { NotificationMessage } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export type ConnectedPreviewPreviewMethod = typeof ConnectedPreview.type.method;

export interface ConnectedPreviewNotificationMessage
  extends NotificationMessage<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  > {}

class ConnectedPreviewProtocolType extends NotificationProtocolType<
  ConnectedPreviewNotificationMessage,
  ConnectedPreviewParams
> {
  method = "preview/connected";
}

export abstract class ConnectedPreview {
  static readonly type = new ConnectedPreviewProtocolType();
}
