import { signal } from "@preact/signals";

/**
 * A request to begin creating a new file — carried from the "Add" button to the
 * FileList that owns the target folder. The FileList shows an in-memory "draft"
 * row (a blank name field pinned to the top of the folder) and only writes the
 * file to disk once a name is committed; a discarded draft never touches disk.
 *
 * `token` makes each click a distinct request (so re-clicking Add with the same
 * dir/ext re-triggers), and lets the owning FileList consume it exactly once.
 */
export interface NewEntryDraftRequest {
  /** Project-relative folder to create into (`""` = project root). */
  dir: string;
  /** Extension for the new file (e.g. `"sd"`). */
  ext: string;
  token: number;
}

export const newEntryDraftRequest = signal<NewEntryDraftRequest | null>(null);

let counter = 0;

/** Ask the FileList owning `dir` to start an in-memory new-file draft. */
export function requestNewEntry(dir: string, ext: string) {
  counter += 1;
  newEntryDraftRequest.value = { dir, ext, token: counter };
}
