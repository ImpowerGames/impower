import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SetPreviewControlsMethod = typeof SetPreviewControlsMessage.method;

export interface SetPreviewControlsParams {
  skipButtons: boolean;
}

export class SetPreviewControlsMessage {
  static readonly method = "preview/setControls";
  static readonly type = new MessageProtocolNotificationType<
    SetPreviewControlsMethod,
    SetPreviewControlsParams
  >(SetPreviewControlsMessage.method);
}

export namespace SetPreviewControlsMessage {
  export interface Notification extends NotificationMessage<
    SetPreviewControlsMethod,
    SetPreviewControlsParams
  > {}
}
