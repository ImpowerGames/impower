import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DragFilesEnterMethod = typeof DragFilesEnterMessage.method;

export type DragFilesEnterParams = {};

export class DragFilesEnterMessage {
  static readonly method = "window/dragFilesEnter";
  static readonly type = new MessageProtocolRequestType<
    DragFilesEnterMethod,
    DragFilesEnterParams,
    {}
  >(DragFilesEnterMessage.method);
}
