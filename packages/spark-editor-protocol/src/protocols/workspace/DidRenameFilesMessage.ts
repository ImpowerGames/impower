import type * as LSP from "vscode-languageserver-protocol";
import type { FileCommits } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidRenameFilesMethod = typeof DidRenameFilesMessage.method;

export interface DidRenameFilesParams extends LSP.RenameFilesParams {
  remote?: boolean;
  commits?: FileCommits;
}

export class DidRenameFilesMessage {
  static readonly method = "workspace/didRenameFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidRenameFilesMethod,
    DidRenameFilesParams
  >(DidRenameFilesMessage.method);
}
