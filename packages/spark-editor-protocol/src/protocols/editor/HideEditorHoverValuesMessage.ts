import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type HideEditorHoverValuesMethod =
  typeof HideEditorHoverValuesMessage.method;

export interface HideEditorHoverValuesParams {}

export class HideEditorHoverValuesMessage {
  static readonly method = "editor/hideHoverValues";
  static readonly type = new MessageProtocolNotificationType<
    HideEditorHoverValuesMethod,
    HideEditorHoverValuesParams
  >(HideEditorHoverValuesMessage.method);
}

export namespace HideEditorHoverValuesMessage {
  export interface Notification extends NotificationMessage<
    HideEditorHoverValuesMethod,
    HideEditorHoverValuesParams
  > {}
}
