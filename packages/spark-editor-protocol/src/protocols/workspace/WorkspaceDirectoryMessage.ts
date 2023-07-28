import { URI } from "../../types";
import { WorkspaceEntry } from "../../types/workspace/WorkspaceEntry";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WorkspaceDirectoryMethod = typeof WorkspaceDirectoryMessage.method;

export interface WorkspaceDirectoryParams {
  directory: { uri: URI };
}

export namespace WorkspaceDirectoryMessage {
  export const method = "workspace/directory";
  export const type = new MessageProtocolRequestType<
    WorkspaceDirectoryMethod,
    WorkspaceDirectoryParams,
    WorkspaceEntry[]
  >(WorkspaceDirectoryMessage.method);
}
