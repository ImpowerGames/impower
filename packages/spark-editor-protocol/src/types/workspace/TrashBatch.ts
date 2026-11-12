export interface TrashEntry {
  relPath: string;
  originalUri: string;
  type: string;
}

export interface TrashReason {
  kind: "failed-edit";
  action?: string;
}

export interface TrashBatch {
  batchId: string;
  deletedAt: number;
  entries: TrashEntry[];
  folders?: string[];
  reason?: TrashReason;
}
