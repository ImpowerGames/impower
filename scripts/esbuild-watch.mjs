import fs from "node:fs";
import path from "node:path";

// workaround(esbuild): ctx.watch() polls build inputs on a timer (about 2,000 file opens a second per idle watcher on Windows); rebuilds use fs.watch
export async function watchBuild(
  ctx,
  {
    extraInputs = () => [],
    onError = (error) => console.error(error?.message ?? error),
    debounceMs = 100,
    cwd = process.cwd(),
  } = {},
) {
  const key = (file) => (process.platform === "win32" ? file.toLowerCase() : file);
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
      watcher.on("error", () => {
        watcher.close();
        if (watchers.get(key(dir)) === watcher) watchers.delete(key(dir));
      });
      watchers.set(key(dir), watcher);
    } catch {
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
    watched: () => [...watchers.keys()],
    close() {
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
