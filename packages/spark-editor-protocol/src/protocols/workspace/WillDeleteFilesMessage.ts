import { DeleteFilesParams, FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillDeleteFilesMethod = typeof WillDeleteFilesMessage.method;

export interface WillDeleteFilesParams extends DeleteFilesParams {
  mode?: "trash" | "permanent";
  folders?: { uri: string }[];
  batchKey?: string;
}

export const TRASH_BATCH_KEY = /^[A-Za-z0-9-]{1,64}$/;

export const isTrashBatchOf = (batchId: string, batchKey: string) =>
  batchId.endsWith(`__${batchKey}`);

export interface WillDeleteFilesRefusal {
  files: FileData[];
  skipped: string[];
  batchId?: string;
}

export const willDeleteFilesRefusal = (
  error: unknown,
): WillDeleteFilesRefusal | undefined => {
  const data = (error as { data?: Partial<WillDeleteFilesRefusal> } | null)
    ?.data;
  if (!Array.isArray(data?.skipped) || !Array.isArray(data?.files)) {
    return undefined;
  }
  return typeof data.batchId === "string"
    ? { files: data.files, skipped: data.skipped, batchId: data.batchId }
    : { files: data.files, skipped: data.skipped };
};

export class WillDeleteFilesMessage {
  static readonly method = "workspace/willDeleteFiles";
  static readonly type = new MessageProtocolRequestType<
    WillDeleteFilesMethod,
    WillDeleteFilesParams,
    FileData[]
  >(WillDeleteFilesMessage.method);
}
