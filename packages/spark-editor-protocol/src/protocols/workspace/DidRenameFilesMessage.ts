import { RenameFilesParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidRenameFilesMethod = typeof DidRenameFilesMessage.method;

export interface DidRenameFilesParams extends RenameFilesParams {}

export abstract class DidRenameFilesMessage {
  static readonly method = "workspace/didRenameFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidRenameFilesMethod,
    DidRenameFilesParams
  >(DidRenameFilesMessage.method);
}
