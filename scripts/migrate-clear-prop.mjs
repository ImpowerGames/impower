import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleBench } from "./bench/benchLauncher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SCRIPT_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const BUILTINS = path.join(HERE, "..", "packages", "sparkdown", "src", "compiler", "builtins", "builtins.sd");

function usage() {
  return "usage: node scripts/migrate-clear-prop.mjs <project directory or file> [...] [--check]";
}

function walk(target, files) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, files);
    } else if (entry.isFile() && (/\.(sd|md)$/.test(entry.name) || SCRIPT_FILE.test(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function loadCodemod() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-clear-prop-"));
  try {
    const bundle = await bundleBench(path.join(HERE, "migrate-clear-prop", "migrateClearProp.ts"), scratch, null);
    return await import(pathToFileURL(bundle).href);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function migrateClearProps(targets, { check = false, log = console.log } = {}) {
  const codemod = await loadCodemod();
  const typescript = createRequire(import.meta.url)("typescript");
  const builtins = codemod.emptiedNames(fs.readFileSync(BUILTINS, "utf8"));
  const changed = [];
  const failed = [];
  const relativeOf = (file) => path.relative(process.cwd(), file).split(path.sep).join("/");
  const seen = new Set();
  for (const target of targets) {
    const files = walk(path.resolve(target), [])
      .filter((file) => !seen.has(file))
      .sort();
    files.forEach((file) => seen.add(file));
    const names = new Set(builtins);
    const unparsed = new Set();
    for (const file of files.filter((f) => f.endsWith(".sd"))) {
      try {
        for (const name of codemod.emptiedNames(fs.readFileSync(file, "utf8"))) names.add(name);
      } catch (error) {
        unparsed.add(file);
        failed.push(`${relativeOf(file)}: ${error.message}`);
      }
    }
    for (const file of files.filter((f) => !unparsed.has(f))) {
      const source = fs.readFileSync(file, "utf8");
      const relative = relativeOf(file);
      let result;
      try {
        result = file.endsWith(".md")
          ? codemod.migrateMarkdownClearProp(source, builtins)
          : SCRIPT_FILE.test(file)
            ? codemod.migrateScriptClearProp(source, typescript, file, builtins)
            : codemod.migrateClearProp(source, names);
      } catch (error) {
        failed.push(`${relative}: ${error.message}`);
        continue;
      }
      if (result.text !== source) {
        changed.push({ relative, migrated: result.migrated });
        if (!check) fs.writeFileSync(file, result.text);
      }
    }
  }
  for (const { relative, migrated } of changed) {
    log(`${check ? "would add" : "added"} #clear to ${migrated} element${migrated === 1 ? "" : "s"} in ${relative}`);
  }
  for (const line of failed) log(`error: ${line}`);
  return { changed, failed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const targets = args.filter((arg) => arg !== "--check");
  if (targets.length === 0 || targets.some((target) => !fs.existsSync(target))) {
    console.error(usage());
    process.exit(2);
  }
  const { changed, failed } = await migrateClearProps(targets, { check });
  console.log(`${changed.length} file${changed.length === 1 ? "" : "s"} ${check ? "to migrate" : "migrated"}, ${failed.length} error${failed.length === 1 ? "" : "s"}`);
  process.exit(failed.length > 0 || (check && changed.length > 0) ? 1 : 0);
}
