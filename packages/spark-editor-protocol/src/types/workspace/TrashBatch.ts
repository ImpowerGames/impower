export interface TrashEntry {
  relPath: string;
  originalUri: string;
  type: string;
}

export interface TrashBatch {
  batchId: string;
  deletedAt: number;
  entries: TrashEntry[];
}
