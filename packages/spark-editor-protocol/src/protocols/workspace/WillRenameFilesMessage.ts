import { FileData, FileRename, RenameFileOptions } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillRenameFilesMethod = typeof WillRenameFilesMessage.method;

export interface WillRenameFilesParams {
  files: (FileRename & { options?: RenameFileOptions })[];
}

export class WillRenameFilesMessage {
  static readonly method = "workspace/willRenameFiles";
  static readonly type = new MessageProtocolRequestType<
    WillRenameFilesMethod,
    WillRenameFilesParams,
    FileData[]
  >(WillRenameFilesMessage.method);
}
