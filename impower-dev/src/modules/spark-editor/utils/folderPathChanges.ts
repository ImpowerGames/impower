type FolderPathChangeListener = (oldPath: string, newPath: string) => void;

const listeners = new Set<FolderPathChangeListener>();

export function onFolderPathChanged(
  listener: FolderPathChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyFolderPathChanged(oldPath: string, newPath: string) {
  if (oldPath === newPath) {
    return;
  }
  for (const listener of listeners) {
    listener(oldPath, newPath);
  }
}
