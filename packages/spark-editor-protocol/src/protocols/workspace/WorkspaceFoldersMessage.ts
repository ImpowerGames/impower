import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WorkspaceFoldersMethod = typeof WorkspaceFoldersMessage.method;

export abstract class WorkspaceFoldersMessage {
  static readonly method = "workspace/workspaceFolders";
  static readonly type = new MessageProtocolRequestType<
    WorkspaceFoldersMethod,
    undefined,
    WorkspaceFolder[]
  >(WorkspaceFoldersMessage.method);
}
