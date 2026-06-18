import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DraggedFilesOverMethod = typeof DraggedFilesOverMessage.method;

export type DraggedFilesOverParams = {};

export class DraggedFilesOverMessage {
  static readonly method = "window/dragFilesOver";
  static readonly type = new MessageProtocolNotificationType<
    DraggedFilesOverMethod,
    DraggedFilesOverParams
  >(DraggedFilesOverMessage.method);
}
