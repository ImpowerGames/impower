import { CreateFilesParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCreateFilesMethod = typeof DidCreateFilesMessage.method;

export interface DidCreateFilesParams extends CreateFilesParams {}

export abstract class DidCreateFilesMessage {
  static readonly method = "workspace/didCreateFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidCreateFilesMethod,
    DidCreateFilesParams
  >(DidCreateFilesMessage.method);
}
