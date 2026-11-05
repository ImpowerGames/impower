import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SetPreviewThemeMethod = typeof SetPreviewThemeMessage.method;

export interface SetPreviewThemeParams {
  theme: string;
}

export class SetPreviewThemeMessage {
  static readonly method = "preview/setTheme";
  static readonly type = new MessageProtocolNotificationType<
    SetPreviewThemeMethod,
    SetPreviewThemeParams
  >(SetPreviewThemeMessage.method);
}

export namespace SetPreviewThemeMessage {
  export interface Notification extends NotificationMessage<
    SetPreviewThemeMethod,
    SetPreviewThemeParams
  > {}
}
