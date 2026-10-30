import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

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

export async function bundleBench(entry, outDir, mapDir) {
  const require = createRequire(path.join(ROOT, "package.json"));
  const esbuild = require("esbuild");
  const outfile = path.join(outDir, path.basename(entry).replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [path.resolve(HERE, entry)],
    outfile,
    bundle: true,
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
