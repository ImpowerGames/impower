import {
  RequestMessage,
  ResponseMessage,
  WorkspaceFolder,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export type WorkspaceFoldersMethod = typeof WorkspaceFolders.type.method;

export interface WorkspaceFoldersRequestMessage
  extends RequestMessage<WorkspaceFoldersMethod> {}

export interface WorkspaceFoldersResponseMessage
  extends ResponseMessage<WorkspaceFoldersMethod, WorkspaceFolder[]> {
  result: WorkspaceFolder[];
}

class WorkspaceFoldersProtocolType extends RequestProtocolType<
  WorkspaceFoldersRequestMessage,
  WorkspaceFoldersResponseMessage
> {
  method = "workspace/workspaceFolders";
  override response(
    id: number | string,
    result: WorkspaceFolder[]
  ): WorkspaceFoldersResponseMessage {
    return {
      ...super.response(id),
      result,
    };
  }
}

export abstract class WorkspaceFolders {
  static readonly type = new WorkspaceFoldersProtocolType();
}
