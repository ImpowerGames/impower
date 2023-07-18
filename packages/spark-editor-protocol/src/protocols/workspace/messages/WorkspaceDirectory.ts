import {
  RequestMessage,
  ResponseMessage,
  URI,
  WorkspaceEntry,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export interface WorkspaceDirectoryParams {
  directory: { uri: URI };
}

export type WorkspaceDirectoryMethod = typeof WorkspaceDirectory.type.method;

export interface WorkspaceDirectoryRequestMessage
  extends RequestMessage<WorkspaceDirectoryMethod, WorkspaceDirectoryParams> {
  params: WorkspaceDirectoryParams;
}

export interface WorkspaceDirectoryResponseMessage
  extends ResponseMessage<WorkspaceDirectoryMethod, WorkspaceEntry[]> {
  result: WorkspaceEntry[];
}

class WorkspaceDirectoryProtocolType extends RequestProtocolType<
  WorkspaceDirectoryRequestMessage,
  WorkspaceDirectoryResponseMessage,
  WorkspaceDirectoryParams
> {
  method = "workspace/directory";
  override response(
    id: number | string,
    result: WorkspaceEntry[]
  ): WorkspaceDirectoryResponseMessage {
    return {
      ...super.response(id),
      result,
    };
  }
}

export abstract class WorkspaceDirectory {
  static readonly type = new WorkspaceDirectoryProtocolType();
}
