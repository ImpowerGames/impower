import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DraggedFilesInMethod = typeof DraggedFilesInMessage.method;

export type DraggedFilesInParams = {};

export class DraggedFilesInMessage {
  static readonly method = "window/dragFilesEnter";
  static readonly type = new MessageProtocolNotificationType<
    DraggedFilesInMethod,
    DraggedFilesInParams
  >(DraggedFilesInMessage.method);
}
