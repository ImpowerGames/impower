import { FileData, URI } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadDirectoryFilesMethod = typeof ReadDirectoryFilesMessage.method;

export interface ReadDirectoryFilesParams {
  directory: { uri: URI };
}

export namespace ReadDirectoryFilesMessage {
  export const method = "workspace/readDirectoryFiles";
  export const type = new MessageProtocolRequestType<
    ReadDirectoryFilesMethod,
    ReadDirectoryFilesParams,
    FileData[]
  >(ReadDirectoryFilesMessage.method);
}
