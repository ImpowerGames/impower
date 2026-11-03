import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleBench } from "./bench/benchLauncher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git"]);

function usage() {
  return "usage: node scripts/migrate-struct-braces.mjs <directory> [--check] [--keep-indent]";
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (entry.isFile() && /\.(sd|md)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

async function loadCodemod() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-struct-braces-"));
  try {
    const bundle = await bundleBench(path.join(HERE, "migrate-struct-braces", "migrateStructBraces.ts"), scratch, null);
    return await import(pathToFileURL(bundle).href);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function migrateDirectory(dir, { check = false, keepIndent = false, log = console.log } = {}) {
  const codemod = await loadCodemod();
  const root = path.resolve(dir);
  const changed = [];
  const skipped = [];
  const failed = [];
  for (const file of walk(root, []).sort()) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file).split(path.sep).join("/");
    let result;
    try {
      result = file.endsWith(".md") ? codemod.migrateMarkdownStructBraces(source, { keepIndent }) : codemod.migrateStructBraces(source, { keepIndent });
    } catch (error) {
      failed.push(`${relative}: ${error.message}`);
      continue;
    }
    for (const skip of result.skipped) skipped.push(`${relative}:${skip.line}: ${skip.keyword} left unchanged, ${skip.reason}`);
    if (result.text !== source) {
      changed.push({ relative, migrated: result.migrated });
      if (!check) fs.writeFileSync(file, result.text);
    }
  }
  for (const { relative, migrated } of changed) log(`${check ? "would migrate" : "migrated"} ${migrated} block${migrated === 1 ? "" : "s"} in ${relative}`);
  for (const line of skipped) log(line);
  for (const line of failed) log(`error: ${line}`);
  return { changed, skipped, failed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = new Set(["--check", "--keep-indent"]);
  const check = args.includes("--check");
  const keepIndent = args.includes("--keep-indent");
  const dirs = args.filter((arg) => !flags.has(arg));
  if (dirs.length !== 1 || !fs.existsSync(dirs[0]) || !fs.statSync(dirs[0]).isDirectory()) {
    console.error(usage());
    process.exit(2);
  }
  const { changed, skipped, failed } = await migrateDirectory(dirs[0], { check, keepIndent });
  console.log(`${changed.length} file${changed.length === 1 ? "" : "s"} ${check ? "to migrate" : "migrated"}, ${skipped.length} block${skipped.length === 1 ? "" : "s"} left unchanged, ${failed.length} error${failed.length === 1 ? "" : "s"}`);
  process.exit(failed.length > 0 || (check && changed.length > 0) ? 1 : 0);
}
