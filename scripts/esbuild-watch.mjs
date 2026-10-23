// Rebuilds an esbuild context when one of its inputs changes, driven by the
// file system's change notifications instead of esbuild's own ctx.watch().
//
// ctx.watch() polls: it rereads files of the build graph on a timer, and each
// idle watcher made about 2,000 file opens a second on Windows. Defender scans
// every open, and over a three-day `npm run web:dev` the kernel memory behind
// them grew by about 26 GB that only a reboot released. fs.watch is the
// system's own notification (ReadDirectoryChangesW, inotify, FSEvents) and has
// no polling mode, so an idle watcher here opens no file at all.
//
// The watched set is the directory of every input in the last build's
// metafile, outside node_modules, plus `extraInputs`: files a plugin bundled
// opaquely, which the metafile cannot list. It is recomputed after every
// build, so a new import is watched from the build that first reads it. A
// failed build keeps the previous set and adds the files its errors name, so
// fixing the error rebuilds even when no build has succeeded yet. In a watched
// directory, a change to an input, or any file appearing or disappearing
// (which can satisfy a failed import), schedules one debounced rebuild. A
// failed rebuild goes to `onError` and watching continues.
//
// The context must be created with `metafile: true`.
import fs from "node:fs";
import path from "node:path";

export async function watchBuild(
  ctx,
  {
    extraInputs = () => [],
    onError = (error) => console.error(error?.message ?? error),
    debounceMs = 100,
    cwd = process.cwd(),
  } = {},
) {
  // Windows paths compare without case; the metafile and the change events
  // need not spell a path alike.
  const key = (file) => (process.platform === "win32" ? file.toLowerCase() : file);
  // esbuild names an input outside the file namespace `<namespace>:<path>`
  // (the `?raw` loader's, for one); a single letter before a colon is a drive.
  const toPath = (input) => path.resolve(cwd, /^[^:/\\]{2,}:(.+)$/.exec(input)?.[1] ?? input);
  const inputs = new Set();
  const watchers = new Map();
  let timer;
  let running = false;
  let pending = false;
  let closed = false;

  const watchDirectory = (dir) => {
    try {
      const watcher = fs.watch(dir, (event, name) => {
        const file = name ? key(path.join(dir, name.toString())) : null;
        if (!file || inputs.has(file) || event === "rename") schedule();
      });
      // The directory went away; a later build that still reads it watches it again.
      watcher.on("error", () => {
        watcher.close();
        if (watchers.get(key(dir)) === watcher) watchers.delete(key(dir));
      });
      watchers.set(key(dir), watcher);
    } catch {
      // Already gone; as above.
    }
  };
  const record = (files, keep) => {
    if (!keep) inputs.clear();
    for (const file of [...files, ...extraInputs()].map((f) => path.resolve(cwd, f))) {
      if (!file.split(path.sep).includes("node_modules")) inputs.add(key(file));
    }
    const dirs = new Set([...inputs].map((file) => path.dirname(file)));
    for (const [dir, watcher] of watchers) {
      if (!dirs.has(dir)) {
        watcher.close();
        watchers.delete(dir);
      }
    }
    for (const dir of dirs) if (!watchers.has(dir)) watchDirectory(dir);
  };
  const build = async () => {
    let result;
    try {
      result = await ctx.rebuild();
    } catch (error) {
      record((error?.errors ?? []).map((e) => e.location?.file).filter(Boolean).map(toPath), true);
      onError(error);
      return;
    }
    if (!result.metafile) throw new Error("watchBuild needs an esbuild context created with metafile: true");
    record(Object.keys(result.metafile.inputs).map(toPath), false);
  };
  // One build at a time: a change during a build runs one more after it.
  const run = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await build();
    } finally {
      running = false;
      if (pending && !closed) {
        pending = false;
        schedule();
      }
    }
  };
  function schedule() {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  }

  await run();
  return {
    // The directories watched now, for checks.
    watched: () => [...watchers.keys()],
    close() {
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
