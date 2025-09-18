import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorPinpointsMethod =
  typeof ChangedEditorPinpointsMessage.method;

export interface ChangedEditorPinpointsParams {
  textDocument: TextDocumentIdentifier;
  pinpointLines: number[];
}

export class ChangedEditorPinpointsMessage {
  static readonly method = "editor/pinpointsChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorPinpointsMethod,
    ChangedEditorPinpointsParams
  >(ChangedEditorPinpointsMessage.method);
}

export namespace ChangedEditorPinpointsMessage {
  export interface Notification
    extends NotificationMessage<
      ChangedEditorPinpointsMethod,
      ChangedEditorPinpointsParams
    > {}
}
