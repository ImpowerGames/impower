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
