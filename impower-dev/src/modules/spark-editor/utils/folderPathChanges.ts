/**
 * A broadcast channel for "a folder's path changed" events, so path-keyed view
 * state (e.g. a FileList's expanded-folders Set) can be remapped when a move
 * happens OUTSIDE the component that owns that state — specifically undo/redo,
 * whose closures live in the module-level undo manager and can't reach a
 * component's setState directly.
 *
 * Broadcast (not a single callback) is deliberate: multiple panes/trees each
 * keep their own path-keyed state, and a subscriber whose set doesn't contain
 * the path simply no-ops. Forward renames/moves remap their own pane inline and
 * don't fire this — only the undo/redo inversions do — so there's no double
 * remap.
 */
type FolderPathChangeListener = (oldPath: string, newPath: string) => void;

const listeners = new Set<FolderPathChangeListener>();

/** Subscribe to folder path changes. Returns an unsubscribe function. */
export function onFolderPathChanged(
  listener: FolderPathChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announce that a folder moved from `oldPath` to `newPath`. No-op if unchanged. */
export function notifyFolderPathChanged(oldPath: string, newPath: string) {
  if (oldPath === newPath) {
    return;
  }
  for (const listener of listeners) {
    listener(oldPath, newPath);
  }
}
