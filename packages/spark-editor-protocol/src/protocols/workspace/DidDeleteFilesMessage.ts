import type * as LSP from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidDeleteFilesMethod = typeof DidDeleteFilesMessage.method;

export interface DidDeleteFilesParams extends LSP.DeleteFilesParams {}

export class DidDeleteFilesMessage {
  static readonly method = "workspace/didDeleteFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidDeleteFilesMethod,
    DidDeleteFilesParams
  >(DidDeleteFilesMessage.method);
}
