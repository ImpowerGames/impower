import { RenameFilesParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidRenameFilesMethod = typeof DidRenameFiles.method;

export interface DidRenameFilesParams extends RenameFilesParams {}

export abstract class DidRenameFiles {
  static readonly method = "workspace/didRenameFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidRenameFilesMethod,
    DidRenameFilesParams
  >(DidRenameFiles.method);
}
