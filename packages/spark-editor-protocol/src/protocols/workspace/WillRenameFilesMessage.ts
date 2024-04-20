import { FileData, RenameFilesParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillRenameFilesMethod = typeof WillRenameFilesMessage.method;

export interface WillRenameFilesParams extends RenameFilesParams {}

export class WillRenameFilesMessage {
  static readonly method = "workspace/willRenameFiles";
  static readonly type = new MessageProtocolRequestType<
    WillRenameFilesMethod,
    WillRenameFilesParams,
    FileData[]
  >(WillRenameFilesMessage.method);
}
