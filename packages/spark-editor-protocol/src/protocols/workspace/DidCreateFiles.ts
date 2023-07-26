import { CreateFilesParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCreateFilesMethod = typeof DidCreateFiles.method;

export interface DidCreateFilesParams extends CreateFilesParams {}

export abstract class DidCreateFiles {
  static readonly method = "workspace/didCreateFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidCreateFilesMethod,
    DidCreateFilesParams
  >(DidCreateFiles.method);
}
