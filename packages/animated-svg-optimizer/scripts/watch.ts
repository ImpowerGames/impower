import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

/**
 * Watches each character's `Exported` folder under the SVG Renders root and
 * regenerates the optimized SVG into the sibling `Optimized` folder whenever an
 * exported SVG changes (or is missing from `Optimized`).
 *
 * Usage:
 *   node scripts/watch.ts [rootDir] [pollMs]
 *
 * Defaults:
 *   rootDir = "G:\\My Drive\\Raffles & Bunny\\Art\\Characters\\SVG Renders"
 *   pollMs  = 3000
 *
 * Layout it expects:
 *   <root>/<character>/Exported/*.svg   -> input
 *   <root>/<character>/Optimized/*.svg  -> output (same basename)
 *
 * Polling (not fs.watch) is used on purpose: the renders live on a Google Drive
 * virtual filesystem where native change events are unreliable. A file is only
 * optimized once its mtime has settled (unchanged across two polls), so we never
 * process a half-synced/partial write.
 */

const ROOT =
  process.argv[2] ||
  "G:\\My Drive\\Raffles & Bunny\\Art\\Characters\\SVG Renders";
const POLL_MS = Number(process.argv[3] || 3000);

// Optional: after each successful optimize, also copy the result (flat, same
// basename) into this directory. Set via the OPTIMIZED_COPY_DIR env var so the
// watcher itself stays project-agnostic.
const COPY_DIR = process.env.OPTIMIZED_COPY_DIR || "";

const OPTIMIZE_SCRIPT = path.join(import.meta.dirname, "optimize.ts");

// source path -> mtimeMs observed on the previous poll (settle detection)
const lastSeenMtime = new Map<string, number>();

function log(msg: string): void {
  const t = new Date().toISOString();
  console.log(`[${t}] ${msg}`);
}

function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function listSvgs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".svg"))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function mtimeMs(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function optimize(input: string, output: string): void {
  const res = spawnSync(process.execPath, [OPTIMIZE_SCRIPT, input, output], {
    encoding: "utf-8",
  });
  if (res.status === 0) {
    log(`✔️  optimized ${path.basename(input)} -> ${output}`);
    if (COPY_DIR) {
      try {
        fs.mkdirSync(COPY_DIR, { recursive: true });
        const dest = path.join(COPY_DIR, path.basename(output));
        fs.copyFileSync(output, dest);
        log(`   ↳ copied to ${dest}`);
      } catch (err) {
        log(`   ↳ ⚠️  copy to ${COPY_DIR} failed: ${(err as Error).message}`);
      }
    }
  } else {
    log(`❌ failed ${path.basename(input)}`);
    if (res.stderr) console.error(res.stderr.trim());
  }
}

function tick(): void {
  for (const character of listDirs(ROOT)) {
    const exportedDir = path.join(ROOT, character, "Exported");
    if (!fs.existsSync(exportedDir)) continue;

    const optimizedDir = path.join(ROOT, character, "Optimized");
    fs.mkdirSync(optimizedDir, { recursive: true });

    for (const name of listSvgs(exportedDir)) {
      const src = path.join(exportedDir, name);
      const out = path.join(optimizedDir, name);

      const srcMtime = mtimeMs(src);
      if (srcMtime == null) continue;

      const prevMtime = lastSeenMtime.get(src);
      lastSeenMtime.set(src, srcMtime);

      // Wait until the file has settled (same mtime two polls in a row) before
      // touching it — avoids reading a partially-synced write from Drive.
      if (prevMtime !== srcMtime) continue;

      const outMtime = mtimeMs(out);
      if (outMtime != null && outMtime >= srcMtime) continue; // already current

      optimize(src, out);
    }
  }
}

log(`Watching "${ROOT}" (every ${POLL_MS}ms). Ctrl+C to stop.`);
tick();
setInterval(tick, POLL_MS);
