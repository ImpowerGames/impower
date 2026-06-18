import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ConnectedEditorMethod = typeof ConnectedEditorMessage.method;

export interface ConnectedEditorParams {}

export class ConnectedEditorMessage {
  static readonly method = "editor/connected";
  static readonly type = new MessageProtocolNotificationType<
    ConnectedEditorMethod,
    ConnectedEditorParams
  >(ConnectedEditorMessage.method);
}

export namespace ConnectedEditorMessage {
  export interface Notification
    extends NotificationMessage<ConnectedEditorMethod, ConnectedEditorParams> {}
}
