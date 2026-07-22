import { FileData } from "../../types";
import { TrashBatch } from "../../types/workspace/TrashBatch";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type TrashFilesMethod = typeof TrashFilesMessage.method;

export interface TrashFilesParams {
  projectId: string;
  /**
   * - `list` — return every trash batch (newest first).
   * - `restore` — move the batch's files back to their original locations and
   *   remove the batch (requires `batchId`).
   * - `deleteBatch` — permanently remove one batch (requires `batchId`).
   * - `empty` — permanently remove the whole trash.
   * - `purge` — permanently remove batches older than `retentionMs`.
   */
  action: "list" | "restore" | "deleteBatch" | "empty" | "purge";
  batchId?: string;
  retentionMs?: number;
}

export interface TrashFilesResult {
  /** Present for `list`. */
  batches?: TrashBatch[];
  /** Present for `restore` — the files put back (so the page can update). */
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
