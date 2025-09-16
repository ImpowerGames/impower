import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DragFilesLeaveMethod = typeof DragFilesLeaveMessage.method;

export type DragFilesLeaveParams = {};

export class DragFilesLeaveMessage {
  static readonly method = "window/dragFilesLeave";
  static readonly type = new MessageProtocolRequestType<
    DragFilesLeaveMethod,
    DragFilesLeaveParams,
    {}
  >(DragFilesLeaveMessage.method);
}
