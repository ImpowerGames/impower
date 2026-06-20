/** One file deleted into the recycle bin (restorable to its original location). */
export interface TrashEntry {
  /** Path of the file within its project (e.g. `scripts/intro.sd`). */
  relPath: string;
  /** The file's original project URI, where Restore puts it back. */
  originalUri: string;
  /** Resolved media/type ("script" | "image" | "audio" | "video" | "text" | …). */
  type: string;
}

/**
 * One delete action's worth of trashed files (a single-file delete = one entry;
 * a folder or multi-select delete = many), grouped so they restore together.
 */
export interface TrashBatch {
  /** `<deletedAtMs>__<rand>` — the trash subdirectory name. */
  batchId: string;
  /** When the delete happened (epoch ms). Drives the 30-day auto-expire. */
  deletedAt: number;
  entries: TrashEntry[];
}
