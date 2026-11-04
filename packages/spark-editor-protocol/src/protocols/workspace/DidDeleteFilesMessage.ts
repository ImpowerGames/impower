import type * as LSP from "vscode-languageserver-protocol";
import type { FileCommits } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidDeleteFilesMethod = typeof DidDeleteFilesMessage.method;

export interface DidDeleteFilesParams extends LSP.DeleteFilesParams {
  remote?: boolean;
  commits?: FileCommits;
}

export class DidDeleteFilesMessage {
  static readonly method = "workspace/didDeleteFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidDeleteFilesMethod,
    DidDeleteFilesParams
  >(DidDeleteFilesMessage.method);
}
