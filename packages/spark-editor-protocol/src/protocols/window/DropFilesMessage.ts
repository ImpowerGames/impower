import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DropFilesMethod = typeof DropFilesMessage.method;

export type DropFilesParams = {
  files: { name: string; buffer: ArrayBuffer }[];
};

export class DropFilesMessage {
  static readonly method = "window/dropFiles";
  static readonly type = new MessageProtocolRequestType<
    DropFilesMethod,
    DropFilesParams,
    {}
  >(DropFilesMessage.method);
}
