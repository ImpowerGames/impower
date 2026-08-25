// Dev-only fallback for environments whose browser refuses service-worker
// registration (some embedded/proxied browsers fail `register()` with "An
// unknown error occurred when fetching the script"). Without the worker,
// every `/file:/local/...` asset URL 404s and the game preview renders
// imageless. This module uploads the page's OPFS files to the dev server's
// asset mirror (see the dev-asset-mirror middleware in vite.config.ts), which
// then answers those same URLs itself — no downstream code changes.
//
// Only loaded from index.ts behind `import.meta.env.DEV` AND a detected
// service-worker failure, so production builds and healthy dev sessions never
// run it. Uploads are skipped for files whose `<mtime>-<size>` tag already
// matches the server's manifest, so only the first sync moves real data.

const MIRROR_PREFIX = "/__dev-asset-mirror/";
// Deliberately low. A real project is hundreds of files and ~200 MB of media
// (single assets reach 34 MB), and every concurrent transfer is memory the
// RENDERER holds. Running this wide crashed the embedded browser's renderer
// outright — the tab dies, which from the outside looks exactly like "the
// editor froze". Transfers stream (a `File` body up, a `Blob` written down),
// so the cap is about how many can be in flight at once, not their size.
const CONCURRENCY = 2;
const CLIENT_ID_KEY = "dev-asset-mirror-client";
// Path -> the OPFS version tag this browser last mirrored. Kept client-side
// (not read back from the server manifest) so a RESTORE doesn't look like a
// project full of changes: restored files land with fresh OPFS timestamps,
// which no longer match the server's tags even though the bytes are
// identical. Comparing against what we ourselves last synced keeps the
// post-restore sync a no-op instead of a ~200 MB re-upload.
const SYNCED_TAGS_KEY = "dev-asset-mirror-synced";

/**
 * Per-browser bucket id.
 *
 * One dev server is routinely shared by several browsers — the app's embedded
 * pane, a headless test browser, a regular window — each with its OWN origin
 * storage holding a DIFFERENT project. A mirror keyed only by file path makes
 * them collide: the last writer's `local/main.sd` overwrites everyone else's,
 * and the restore path below would then happily "restore" a foreign file over
 * a real project. Bucketing by client keeps each browser's copy to itself.
 *
 * Stored in `localStorage`, which survives the origin-storage eviction this
 * mirror exists to recover from (eviction clears OPFS + Cache Storage and
 * leaves localStorage intact — observed directly). If it ever is cleared, the
 * client simply gets a new empty bucket: no restore, no cross-contamination.
 */
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
    // Quota — the next sync just re-uploads; not worth failing over.
  }
};

const tagOf = (file: File) => `${file.lastModified}-${file.size}`;

/** Run `task` over `items`, at most `CONCURRENCY` in flight. */
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

/**
 * Reverse sync: repopulate an EMPTY OPFS from the mirror. Embedded browsers
 * that refuse service workers also tend to treat origin storage as
 * best-effort and evict it wholesale (OPFS + Cache Storage gone,
 * `navigator.storage.persisted()` false) — which silently destroys the whole
 * local project. The mirror's on-disk copy survives, so a boot that finds no
 * project files restores them and reloads once. Guarded three ways: only when
 * OPFS holds zero real files (an evicted origin, never a project the author
 * emptied), only when the mirror actually has content, and only once per
 * session (the reload flag) so a failing restore can't loop.
 */
async function restoreOpfsFromDevAssetMirror(
  manifest: Record<string, string>,
  existing: OpfsFile[],
): Promise<boolean> {
  const paths = Object.keys(manifest).filter((p) => !p.startsWith("."));
  if (paths.length === 0) {
    return false;
  }
  // "Empty" means no file with actual content — a fresh boot may have minted
  // a zero-byte placeholder (e.g. an empty main.sd) before this runs, and
  // that must not mask an evicted origin.
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
      // A Blob, not an ArrayBuffer: Chromium keeps blob bytes outside the JS
      // heap and `write` streams them, so a 34 MB asset never has to exist as
      // one renderer-resident buffer.
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
      // The bytes now in OPFS came FROM the mirror, so record the resulting
      // tag as already-synced; without this the next sync sees 660 "changed"
      // files (fresh timestamps) and re-uploads the whole project.
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
      // Server has no mirror middleware (e.g. prod build served statically).
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
    // Compare against what THIS browser last mirrored, falling back to the
    // server's tag for a bucket we have no local record of (a fresh profile
    // pointed at an existing bucket).
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
        // `item.file` is a File handle: fetch streams it, so even a 34 MB
        // asset is never buffered into the JS heap.
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
