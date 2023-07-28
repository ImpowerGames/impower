import { WorkspaceFolder } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WorkspaceFoldersMethod = typeof WorkspaceFoldersMessage.method;

export namespace WorkspaceFoldersMessage {
  export const method = "workspace/workspaceFolders";
  export const type = new MessageProtocolRequestType<
    WorkspaceFoldersMethod,
    undefined,
    WorkspaceFolder[]
  >(WorkspaceFoldersMessage.method);
}
