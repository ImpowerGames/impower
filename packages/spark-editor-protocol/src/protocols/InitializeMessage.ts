import { MessageProtocolRequestType } from "./MessageProtocolRequestType";

export type InitializeMethod = typeof InitializeMessage.method;

export interface InitializeParams {
  /**
   * The files that should be created.
   */
  files: {
    /**
     * The uri of the file.
     */
    uri: string;
    /**
     * The data to populate the file with.
     */
    data: ArrayBuffer;
  }[];
}

export abstract class InitializeMessage {
  static readonly method = "initialize";
  static readonly type = new MessageProtocolRequestType<
    InitializeMethod,
    InitializeParams,
    null
  >(InitializeMessage.method);
}
