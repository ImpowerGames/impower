type ImageWatcher = {
  onDidChange(listener: (uri: { toString(): string }) => void): unknown;
  onDidCreate(listener: (uri: { toString(): string }) => void): unknown;
  onDidDelete(listener: (uri: { toString(): string }) => void): unknown;
  dispose(): void;
};

/** Revisions follow asset events, so preview requests do no filesystem IO. */
export class ImageFileRevisions {
  private versions = new Map<string, number>();
  private nextVersion = 0;
  private watchers = 0;

  get(uri: string): number | undefined {
    return this.versions.get(uri);
  }

  register(uri: string): number {
    let version = this.versions.get(uri);
    if (version === undefined) {
      version = ++this.nextVersion;
      this.versions.set(uri, version);
    }
    return version;
  }

  watch(watcher: ImageWatcher): void {
    this.watchers++;
    const change = (uri: { toString(): string }) => {
      const key = uri.toString();
      // SVG source already carries content identity; its document versions
      // must retain their existing meaning.
      if (/\.svg(?:[?#]|$)/i.test(key)) return;
      this.versions.set(key, ++this.nextVersion);
    };
    watcher.onDidChange(change);
    watcher.onDidCreate(change);
    watcher.onDidDelete(uri => this.versions.delete(uri.toString()));
    const dispose = watcher.dispose.bind(watcher);
    let disposed = false;
    watcher.dispose = () => {
      if (disposed) return;
      disposed = true;
      try { dispose(); }
      finally {
        if (--this.watchers === 0) this.versions.clear();
      }
    };
  }
}

export const imageFileRevisions = new ImageFileRevisions();
