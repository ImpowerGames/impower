import { RenameFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillRenameFilesMethod = typeof WillRenameFilesMessage.method;

export interface WillRenameFilesParams extends RenameFilesParams {}

export namespace WillRenameFilesMessage {
  export const method = "workspace/willRenameFiles";
  export const type = new MessageProtocolNotificationType<
    WillRenameFilesMethod,
    WillRenameFilesParams
  >(WillRenameFilesMessage.method);
}
