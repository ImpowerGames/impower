// What the benchmark launchers under scripts/bench share: reading a flag's
// value, and bundling a TypeScript entry with the repository's esbuild so it
// runs under bare node.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// A flag's value; a flag given with no value, or another flag in its place,
// throws, so `--project "$DIR"` with DIR unset never becomes a fixture run.
export function value(args, i, name) {
  const v = args[i + 1];
  if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}

export function count(text, name, min) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
  return n;
}

// Bundles `entry` (a file beside this one) into `outDir`. With `mapDir`, the
// run is being profiled: the bundle keeps the names its functions were given
// and gets a source map, copied into `mapDir` for profile-shares.mjs. Keeping
// names makes the story engine 15 to 35 percent slower, so a bundle that is
// timed never has them.
export async function bundleBench(entry, outDir, mapDir) {
  const require = createRequire(path.join(HERE, "..", "..", "package.json"));
  const esbuild = require("esbuild");
  const outfile = path.join(outDir, entry.replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [path.join(HERE, entry)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "warning",
    keepNames: Boolean(mapDir),
    sourcemap: mapDir ? "external" : false,
    loader: { ".svg": "text", ".css": "text", ".html": "text", ".yaml": "text", ".sd": "text", ".luau": "text" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  if (mapDir) {
    fs.mkdirSync(mapDir, { recursive: true });
    fs.copyFileSync(outfile + ".map", path.join(mapDir, path.basename(outfile) + ".map"));
  }
  return outfile;
}
