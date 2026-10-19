// What the benchmark launchers under scripts/bench share: reading a flag's
// value, and bundling a TypeScript entry with the repository's esbuild so it
// runs under bare node.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

// Every `@impower/*` workspace package of the checkout at `root`, by name,
// with the absolute directory that holds it: the packages under `packages/`
// and the definitions. The bench entries import the sources by relative path,
// while the sources import one another by package name, and a package name
// resolves through whatever `node_modules` lies above the entry. In a tree
// with no install of its own below a checkout that has one, that is the
// parent checkout's packages, so the bundle held two copies of every module
// reached both ways, and two `Knot` or `Text` classes among them: the heap
// snapshot then counted parsed objects the probe's `ParsedObject` was not an
// ancestor of (#1950). Bundling aliases each name to this checkout's own
// directory, so one tree supplies every module whichever way it is imported.
export function workspaceAliases(root = ROOT) {
  const aliases = {};
  const add = (dir) => {
    const file = path.join(dir, "package.json");
    if (!fs.existsSync(file)) return;
    const { name } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof name === "string" && name.startsWith("@impower/")) aliases[name] = dir;
  };
  const packages = path.join(root, "packages");
  for (const entry of fs.readdirSync(packages, { withFileTypes: true })) if (entry.isDirectory()) add(path.join(packages, entry.name));
  add(path.join(root, "definitions"));
  return aliases;
}

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

// Bundles `entry` (a file beside this one, or an absolute path) into
// `outDir`. With `mapDir`, the run is being profiled: the bundle keeps the
// names its functions were given and gets a source map, copied into `mapDir`
// for profile-shares.mjs. Keeping names makes the story engine 15 to 35
// percent slower, so a bundle that is timed never has them.
export async function bundleBench(entry, outDir, mapDir) {
  const require = createRequire(path.join(ROOT, "package.json"));
  const esbuild = require("esbuild");
  const outfile = path.join(outDir, path.basename(entry).replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [path.resolve(HERE, entry)],
    outfile,
    bundle: true,
    // An aliased path is resolved from the working directory, and the
    // directories are absolute, so the bundle is the same from any one.
    alias: workspaceAliases(),
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
