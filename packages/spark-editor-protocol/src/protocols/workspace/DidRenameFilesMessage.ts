import { RenameFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidRenameFilesMethod = typeof DidRenameFilesMessage.method;

export interface DidRenameFilesParams extends RenameFilesParams {}

export namespace DidRenameFilesMessage {
  export const method = "workspace/didRenameFiles";
  export const type = new MessageProtocolNotificationType<
    DidRenameFilesMethod,
    DidRenameFilesParams
  >(DidRenameFilesMessage.method);
}
