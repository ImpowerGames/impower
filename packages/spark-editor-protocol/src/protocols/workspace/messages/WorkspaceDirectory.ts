import {
  RequestMessage,
  ResponseMessage,
  URI,
  WorkspaceEntry,
} from "../../../types";
import { uuid } from "../../../utils/uuid";

export interface WorkspaceDirectoryParams {
  directory: { uri: URI };
}

export type WorkspaceDirectoryMethod = typeof WorkspaceDirectory.method;

export interface WorkspaceDirectoryRequestMessage
  extends RequestMessage<WorkspaceDirectoryMethod, WorkspaceDirectoryParams> {
  params: WorkspaceDirectoryParams;
}

export interface WorkspaceDirectoryResponseMessage
  extends ResponseMessage<WorkspaceDirectoryMethod, WorkspaceEntry[]> {
  result: WorkspaceEntry[];
}

export class WorkspaceDirectory {
  static readonly method = "workspace/directory";
  static isRequest(obj: any): obj is WorkspaceDirectoryRequestMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static isResponse(obj: any): obj is WorkspaceDirectoryResponseMessage {
    return obj.method === this.method && obj.result !== undefined;
  }
  static request(
    params: WorkspaceDirectoryParams
  ): WorkspaceDirectoryRequestMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    };
  }
  static response(
    id: number | string,
    result: WorkspaceEntry[]
  ): WorkspaceDirectoryResponseMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    };
  }
}
