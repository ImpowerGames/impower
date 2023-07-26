import { DeleteFilesParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidDeleteFilesMethod = typeof DidDeleteFilesMessage.method;

export interface DidDeleteFilesParams extends DeleteFilesParams {}

export abstract class DidDeleteFilesMessage {
  static readonly method = "workspace/didDeleteFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidDeleteFilesMethod,
    DidDeleteFilesParams
  >(DidDeleteFilesMessage.method);
}
