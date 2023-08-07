import { FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type CreateFilesMethod = typeof CreateFilesMessage.method;

export interface CreateFilesParams {
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

export namespace CreateFilesMessage {
  export const method = "workspace/createFiles";
  export const type = new MessageProtocolRequestType<
    CreateFilesMethod,
    CreateFilesParams,
    FileData[]
  >(CreateFilesMessage.method);
}
