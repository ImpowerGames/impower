import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type ReadFileMethod = typeof ReadFile.method;

export interface ReadFileParams {
  /**
   * The file that should be read.
   */
  file: { uri: string };
}

export abstract class ReadFile {
  static readonly method = "workspace/readFile";
  static readonly type = new MessageProtocolRequestType<
    ReadFileMethod,
    ReadFileParams,
    string
  >(ReadFile.method);
}
