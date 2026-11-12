import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ClaimedEditorEditMethod = typeof ClaimedEditorEditMessage.method;

export interface ClaimedEditorEditParams {
  request: number | string;
  uri: string;
  text: string;
}

export class ClaimedEditorEditMessage {
  static readonly method = "editor/claimedEdit";
  static readonly type = new MessageProtocolNotificationType<
    ClaimedEditorEditMethod,
    ClaimedEditorEditParams
  >(ClaimedEditorEditMessage.method);
}

export namespace ClaimedEditorEditMessage {
  export interface Notification extends NotificationMessage<
    ClaimedEditorEditMethod,
    ClaimedEditorEditParams
  > {}
}
