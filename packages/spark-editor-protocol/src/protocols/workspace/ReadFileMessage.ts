import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadFileMethod = typeof ReadFileMessage.method;

export interface ReadFileParams {
  /**
   * The file that should be read.
   */
  file: { uri: string };
}

export namespace ReadFileMessage {
  export const method = "workspace/readFile";
  export const type = new MessageProtocolRequestType<
    ReadFileMethod,
    ReadFileParams,
    ArrayBuffer
  >(ReadFileMessage.method);
}
