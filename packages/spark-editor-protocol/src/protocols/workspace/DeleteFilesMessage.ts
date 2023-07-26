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

export abstract class DeleteFilesMessage {
  static readonly method = "workspace/deleteFiles";
  static readonly type = new MessageProtocolRequestType<
    DeleteFilesMethod,
    DeleteFilesParams,
    null
  >(DeleteFilesMessage.method);
}
