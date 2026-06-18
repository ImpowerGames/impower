import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DraggedFilesOutMethod = typeof DraggedFilesOutMessage.method;

export type DraggedFilesOutParams = {};

export class DraggedFilesOutMessage {
  static readonly method = "window/dragFilesLeave";
  static readonly type = new MessageProtocolNotificationType<
    DraggedFilesOutMethod,
    DraggedFilesOutParams
  >(DraggedFilesOutMessage.method);
}
