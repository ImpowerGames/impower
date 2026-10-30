const MIRROR_PREFIX = "/__dev-asset-mirror/";
// workaround(chromium): an embedded browser's renderer crashes when many concurrent OPFS transfers are in flight, so concurrency is capped at 2
const CONCURRENCY = 2;
const CLIENT_ID_KEY = "dev-asset-mirror-client";
const SYNCED_TAGS_KEY = "dev-asset-mirror-synced";

const clientId = (() => {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
})();

const MANIFEST_URL = `${MIRROR_PREFIX}manifest?client=${encodeURIComponent(clientId)}`;
const UPLOAD_PREFIX = `${MIRROR_PREFIX}${encodeURIComponent(clientId)}/`;

type OpfsFile = { path: string; handle: FileSystemFileHandle };

const loadSyncedTags = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_TAGS_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveSyncedTags = (tags: Record<string, string>) => {
  try {
    localStorage.setItem(SYNCED_TAGS_KEY, JSON.stringify(tags));
  } catch {
  }
};

const tagOf = (file: File) => `${file.lastModified}-${file.size}`;

async function pooled<T>(
  items: T[],
  task: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await task(item);
      }
    }),
  );
}

async function collectFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: OpfsFile[],
): Promise<void> {
  for await (const [name, handle] of (dir as any).entries()) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await collectFiles(handle, p, out);
    } else {
      out.push({ path: p, handle });
    }
  }
}

async function restoreOpfsFromDevAssetMirror(
  manifest: Record<string, string>,
  existing: OpfsFile[],
): Promise<boolean> {
  const paths = Object.keys(manifest).filter((p) => !p.startsWith("."));
  if (paths.length === 0) {
    return false;
  }
  for (const { handle } of existing) {
    if ((await handle.getFile()).size > 0) {
      return false;
    }
  }
  if (sessionStorage.getItem("dev-asset-mirror-restored")) {
    return false;
  }
  sessionStorage.setItem("dev-asset-mirror-restored", "1");
  console.log(
    `[dev-asset-mirror] origin storage is empty but the mirror holds ${paths.length} files — restoring the project...`,
  );
  const root = await navigator.storage.getDirectory();
  let restored = 0;
  let failed = 0;
  const syncedTags = loadSyncedTags();
  await pooled(paths, async (p) => {
    try {
      const resp = await fetch(
        UPLOAD_PREFIX + p.split("/").map(encodeURIComponent).join("/"),
      );
      if (!resp.ok) {
        failed++;
        return;
      }
      const blob = await resp.blob();
      const segments = p.split("/");
      let dir = root;
      for (const seg of segments.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(seg, { create: true });
      }
      const fh = await dir.getFileHandle(segments.at(-1)!, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      syncedTags[p] = tagOf(await fh.getFile());
      restored++;
    } catch {
      failed++;
    }
  });
  saveSyncedTags(syncedTags);
  console.log(
    `[dev-asset-mirror] restored ${restored} files` +
      (failed ? ` (${failed} failed)` : "") +
      " — reloading so the editor picks the project back up.",
  );
  location.reload();
  return true;
}

export async function syncOpfsToDevAssetMirror(): Promise<void> {
  let manifest: Record<string, string>;
  try {
    const resp = await fetch(MANIFEST_URL);
    if (!resp.ok) {
      return;
    }
    manifest = await resp.json();
  } catch {
    return;
  }

  const root = await navigator.storage.getDirectory();
  const files: OpfsFile[] = [];
  await collectFiles(root, "", files);

  if (await restoreOpfsFromDevAssetMirror(manifest, files)) {
    return;
  }

  const syncedTags = loadSyncedTags();
  const stale: { path: string; file: File; tag: string }[] = [];
  for (const { path, handle } of files) {
    const file = await handle.getFile();
    const tag = tagOf(file);
    const known = syncedTags[path] ?? manifest[path];
    if (known !== tag) {
      stale.push({ path, file, tag });
    }
  }
  if (stale.length === 0) {
    console.log("[dev-asset-mirror] up to date (" + files.length + " files)");
    return;
  }

  console.log(
    `[dev-asset-mirror] service worker unavailable — mirroring ${stale.length} of ${files.length} OPFS files to the dev server...`,
  );
  let uploaded = 0;
  let failed = 0;
  await pooled(stale, async (item) => {
    try {
      const resp = await fetch(
        UPLOAD_PREFIX +
          item.path.split("/").map(encodeURIComponent).join("/") +
          `?v=${encodeURIComponent(item.tag)}`,
        { method: "PUT", body: item.file },
      );
      if (resp.ok) {
        uploaded++;
        syncedTags[item.path] = item.tag;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  });
  saveSyncedTags(syncedTags);
  console.log(
    `[dev-asset-mirror] mirrored ${uploaded} files` +
      (failed ? ` (${failed} failed)` : "") +
      " — asset URLs now resolve without the service worker.",
  );
}
