import {
  RequestMessage,
  ResponseMessage,
  WorkspaceFolder,
} from "../../../types";
import { uuid } from "../../../utils/uuid";

export type WorkspaceFoldersMethod = typeof WorkspaceFolders.method;

export interface WorkspaceFoldersRequestMessage
  extends RequestMessage<WorkspaceFoldersMethod> {}

export interface WorkspaceFoldersResponseMessage
  extends ResponseMessage<WorkspaceFoldersMethod, WorkspaceFolder[]> {
  result: WorkspaceFolder[];
}

export class WorkspaceFolders {
  static readonly method = "workspace/workspaceFolders";
  static isRequest(obj: any): obj is WorkspaceFoldersRequestMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static isResponse(obj: any): obj is WorkspaceFoldersResponseMessage {
    return obj.method === this.method && obj.result !== undefined;
  }
  static request(): WorkspaceFoldersRequestMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
    };
  }
  static response(
    id: number | string,
    result: WorkspaceFolder[]
  ): WorkspaceFoldersResponseMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    };
  }
}
