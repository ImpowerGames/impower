import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DeleteFilesMethod = typeof DeleteFilesMessage.method;

export interface DeleteFilesParams {
  /**
   * The file that should be deleted.
   */
  files: {
    /**
     * The uri of the file.
     */
    uri: string;
  }[];
}

export namespace DeleteFilesMessage {
  export const method = "workspace/deleteFiles";
  export const type = new MessageProtocolRequestType<
    DeleteFilesMethod,
    DeleteFilesParams,
    null
  >(DeleteFilesMessage.method);
}
