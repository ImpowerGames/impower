import { WorkspaceFolder } from "../../../types";
import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type WorkspaceFoldersMethod = typeof WorkspaceFolders.method;

export abstract class WorkspaceFolders {
  static readonly method = "workspace/workspaceFolders";
  static readonly type = new MessageProtocolRequestType<
    WorkspaceFoldersMethod,
    undefined,
    WorkspaceFolder[]
  >(WorkspaceFolders.method);
}
