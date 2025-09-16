import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DragFilesOverMethod = typeof DragFilesOverMessage.method;

export type DragFilesOverParams = {};

export class DragFilesOverMessage {
  static readonly method = "window/dragFilesOver";
  static readonly type = new MessageProtocolRequestType<
    DragFilesOverMethod,
    DragFilesOverParams,
    {}
  >(DragFilesOverMessage.method);
}
