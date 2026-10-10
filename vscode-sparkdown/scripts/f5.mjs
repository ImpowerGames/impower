// F5 owns the complete runtime build graph. Producers finish their first
// build before the extension starts copying their workers; all stay watching.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export const runtimeBuilders = [
  ["packages/sparkdown-language-server", "esbuild.js"],
  ["packages/sparkdown-screenplay-pdf", "esbuild.js"],
  ...["game", "screenplay", "screen", "inspector"].map(name =>
    [`vscode-sparkdown/webviews/${name}-webview`, "esbuild.js"]),
];

export async function watchRuntime(root, { start = spawn, log = console.log, io = fs } = {}) {
  const children = [];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    for (const child of children) child.kill();
  };
  const watch = ([dir, script]) => new Promise((resolve, reject) => {
    const child = start(process.execPath, [script, "--watch"], {
      cwd: path.join(root, dir), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const timer = setTimeout(() => reject(new Error(`${dir} did not build within 180 seconds`)), 180_000);
    const done = () => { clearTimeout(timer); resolve(); };
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream });
      lines.on("line", line => {
        log(line);
        if (/build finished$/.test(line)) done();
      });
    }
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (!stopping) {
        const error = new Error(`${dir} watcher exited (${code ?? signal})`);
        reject(error);
        log(`✘ [ERROR] ${error.message}`);
        stop();
        process.exitCode = 1;
      }
    });
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    log("[watch] F5: build started");
    await Promise.all(runtimeBuilders.map(watch));
    await watch(["vscode-sparkdown", "scripts/esbuild.ts"]);
    const out = path.join(root, "vscode-sparkdown", "out");
    for (const worker of ["sparkdown-language-server", "sparkdown-screenplay-pdf"]) {
      const built = io.readFileSync(path.join(root, "packages", worker, "dist", `${worker}.js`));
      const copied = io.readFileSync(path.join(out, "workers", `${worker}.js`));
      if (!built.equals(copied)) throw new Error(`F5 copied a stale ${worker}`);
    }
    for (const name of ["game", "screenplay", "screen", "inspector"]) {
      if (!io.statSync(path.join(out, "webviews", `${name}-webview.js`)).size) throw new Error(`Empty ${name} webview`);
    }
    log("[watch] F5: build finished");
    return { stop, children };
  } catch (error) {
    stop();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  watchRuntime(root).catch(error => { console.error(error); process.exitCode = 1; });
}
