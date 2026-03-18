import type * as LSP from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCreateFilesMethod = typeof DidCreateFilesMessage.method;

export interface DidCreateFilesParams extends LSP.CreateFilesParams {}

export class DidCreateFilesMessage {
  static readonly method = "workspace/didCreateFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidCreateFilesMethod,
    DidCreateFilesParams
  >(DidCreateFilesMessage.method);
}
