import type * as LSP from "vscode-languageserver-protocol";
import type { FileCommits } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCreateFilesMethod = typeof DidCreateFilesMessage.method;

export interface DidCreateFilesParams extends LSP.CreateFilesParams {
  remote?: boolean;
  commits?: FileCommits;
}

export class DidCreateFilesMessage {
  static readonly method = "workspace/didCreateFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidCreateFilesMethod,
    DidCreateFilesParams
  >(DidCreateFilesMessage.method);
}
