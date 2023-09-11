import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadFileMethod = typeof ReadFileMessage.method;

export interface ReadFileParams {
  /**
   * The file that should be read.
   */
  file: { uri: string };
}

export class ReadFileMessage {
  static readonly method = "workspace/readFile";
  static readonly type = new MessageProtocolRequestType<
    ReadFileMethod,
    ReadFileParams,
    ArrayBuffer
  >(ReadFileMessage.method);
}
