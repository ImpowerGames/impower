import { FileData } from "../../types";
import { TrashBatch } from "../../types/workspace/TrashBatch";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type TrashFilesMethod = typeof TrashFilesMessage.method;

export interface TrashFilesParams {
  projectId: string;
  action: "list" | "restore" | "deleteBatch" | "empty" | "purge";
  batchId?: string;
  retentionMs?: number;
}

export interface TrashFilesResult {
  batches?: TrashBatch[];
  restored?: FileData[];
}

export class TrashFilesMessage {
  static readonly method = "workspace/trashFiles";
  static readonly type = new MessageProtocolRequestType<
    TrashFilesMethod,
    TrashFilesParams,
    TrashFilesResult
  >(TrashFilesMessage.method);
}
