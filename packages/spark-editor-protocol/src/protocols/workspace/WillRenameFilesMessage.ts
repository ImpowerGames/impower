import { RenameFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillRenameFilesMethod = typeof WillRenameFilesMessage.method;

export interface WillRenameFilesParams extends RenameFilesParams {}

export class WillRenameFilesMessage {
  static readonly method = "workspace/willRenameFiles";
  static readonly type = new MessageProtocolNotificationType<
    WillRenameFilesMethod,
    WillRenameFilesParams
  >(WillRenameFilesMessage.method);
}
