import { URI } from "vscode-languageserver-protocol";
import { WorkspaceEntry } from "../../types/workspace/WorkspaceEntry";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WorkspaceDirectoryMethod = typeof WorkspaceDirectory.method;

export interface WorkspaceDirectoryParams {
  directory: { uri: URI };
}

export abstract class WorkspaceDirectory {
  static readonly method = "workspace/directory";
  static readonly type = new MessageProtocolRequestType<
    WorkspaceDirectoryMethod,
    WorkspaceDirectoryParams,
    WorkspaceEntry[]
  >(WorkspaceDirectory.method);
}
