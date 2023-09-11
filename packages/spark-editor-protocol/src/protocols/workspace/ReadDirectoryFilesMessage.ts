import { FileData, URI } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadDirectoryFilesMethod = typeof ReadDirectoryFilesMessage.method;

export interface ReadDirectoryFilesParams {
  directory: { uri: URI };
}

export class ReadDirectoryFilesMessage {
  static readonly method = "workspace/readDirectoryFiles";
  static readonly type = new MessageProtocolRequestType<
    ReadDirectoryFilesMethod,
    ReadDirectoryFilesParams,
    FileData[]
  >(ReadDirectoryFilesMessage.method);
}
