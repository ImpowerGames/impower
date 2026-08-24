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

const MANIFEST_URL = "/__dev-asset-mirror/manifest";
const UPLOAD_PREFIX = "/__dev-asset-mirror/";
const CONCURRENCY = 6;

type OpfsFile = { path: string; handle: FileSystemFileHandle };

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
  const queue = [...paths];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      try {
        const resp = await fetch(
          "/file:/" + p.split("/").map(encodeURIComponent).join("/"),
        );
        if (!resp.ok) {
          failed++;
          continue;
        }
        const bytes = await resp.arrayBuffer();
        const segments = p.split("/");
        let dir = root;
        for (const seg of segments.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(seg, { create: true });
        }
        const fh = await dir.getFileHandle(segments.at(-1)!, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        restored++;
      } catch {
        failed++;
      }
    }
  });
  await Promise.all(workers);
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

  const stale: { path: string; file: File; tag: string }[] = [];
  for (const { path, handle } of files) {
    const file = await handle.getFile();
    const tag = `${file.lastModified}-${file.size}`;
    if (manifest[path] !== tag) {
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
  const queue = [...stale];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        const resp = await fetch(
          UPLOAD_PREFIX +
            item.path
              .split("/")
              .map(encodeURIComponent)
              .join("/") +
            `?v=${encodeURIComponent(item.tag)}`,
          { method: "PUT", body: item.file },
        );
        if (resp.ok) {
          uploaded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  });
  await Promise.all(workers);
  console.log(
    `[dev-asset-mirror] mirrored ${uploaded} files` +
      (failed ? ` (${failed} failed)` : "") +
      " — asset URLs now resolve without the service worker.",
  );
}
