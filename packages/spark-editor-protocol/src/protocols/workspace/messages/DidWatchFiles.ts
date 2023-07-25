import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidWatchFilesMethod = typeof DidWatchFiles.method;

export interface FileWatch {
  /**
   * A file:// URI for the location of the file/folder being created.
   */
  uri: string;
}

export interface DidWatchFilesParams {
  /**
   * An array of all files/folders renamed in this operation. When a folder is renamed, only
   * the folder will be included, and not its children.
   */
  files: FileWatch[];
}

export abstract class DidWatchFiles {
  static readonly method = "workspace/didWatchFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidWatchFilesMethod,
    DidWatchFilesParams
  >(DidWatchFiles.method);
}
