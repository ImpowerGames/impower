import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
export const tracked = root => git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);

// The native Windows resolver expands 8.3 names as well as junctions. Resolve
// the existing ancestor for new journal paths, whose final directory is absent.
export function canonicalPath(file) {
  const absolute = path.resolve(file);
  try { return fs.realpathSync.native(absolute); }
  catch (error) {
    if (error.code !== "ENOENT" || path.dirname(absolute) === absolute) throw error;
    return path.join(canonicalPath(path.dirname(absolute)), path.basename(absolute));
  }
}

export function isWithinDirectory(parent, child, paths = path) {
  const relative = paths.relative(parent, child);
  return !!relative && !paths.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + paths.sep);
}

export function childEnvironment(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (["NODE_OPTIONS", "FORCE_COLOR", "NO_COLOR"].includes(key.toUpperCase())) continue;
    env[key] = value;
  }
  return { ...env, NODE_OPTIONS: "--max-old-space-size=1024", NO_COLOR: "1" };
}

// Source identity uses bytes. Installed dependency identity uses path, link
// target, inode, size, mode, modification and change times: package installs and
// edits invalidate evidence without reading gigabytes of binaries per status.
export function fingerprinter(progress = () => {}) {
  const cache = new Map();
  return function fingerprint(root, files) {
    const hash = createHash("sha256");
    const add = value => hash.update(JSON.stringify(value) + "\n");
    // Environment values enter only the digest, never a journal or log. Hash
    // exactly the environment forwarded to children, including enforced caps.
    add({ node: process.version, platform: process.platform, arch: process.arch, files,
      environment: Object.entries(childEnvironment()).sort(([a], [b]) => a.localeCompare(b)) });
    const trackedFiles = tracked(root).sort();
    add({ tracked: trackedFiles });
    // Git ignores do not stop tests or configuration reading local files.
    // Include ignored contents regardless of extension; dependency trees retain
    // the separate metadata strategy, and generated config bundles are not inputs.
    const ignoredInputs = [], ignoredDirectories = new Set();
    function collectIgnored(relative) {
      const file = path.join(root, relative), name = path.basename(file);
      if (["node_modules", ".git", ".vite", ".cache"].includes(name.toLowerCase())) return;
      const stat = fs.statSync(file);
      if (stat.isDirectory()) {
        const real = fs.realpathSync.native(file);
        if (ignoredDirectories.has(real)) return;
        ignoredDirectories.add(real);
        for (const child of fs.readdirSync(file).sort()) collectIgnored(path.join(relative, child));
      } else {
        if (!/\.timestamp-.*\.mjs$/.test(name)) ignoredInputs.push(relative);
      }
    }
    // Ask for ignored directories without descending into installed packages.
    for (const ignored of git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--no-empty-directory", "-z"]).split("\0").filter(Boolean)) collectIgnored(ignored);
    const sources = [...new Set([...trackedFiles, ...git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean), ...ignoredInputs])].sort();
    const visited = new Set();
    let inspected = 0;
    function visit(file, dependency = false) {
      if (++inspected % 1000 === 0) progress({ phase: "identity", inspected });
      add(file);
      let stat;
      try { stat = fs.lstatSync(file, { bigint: true }); }
      catch (error) { if (error.code === "ENOENT") { add("missing"); return; } throw error; }
      if (stat.isSymbolicLink()) {
        add(fs.readlinkSync(file));
        visit(fs.realpathSync.native(file), dependency);
      } else if (stat.isDirectory()) {
        const real = fs.realpathSync.native(file);
        if (visited.has(real)) return;
        visited.add(real);
        for (const name of fs.readdirSync(file).sort()) {
          // Vitest/Vite write caches during normal execution, not dependencies.
          if ([".vite", ".cache", ".git"].includes(name)) continue;
          visit(path.join(file, name), dependency);
        }
      } else if (stat.isFile()) {
        const key = [stat.size, stat.mtimeNs, stat.ctimeNs, stat.ino, stat.mode].join(":");
        if (dependency) { add(key); return; }
        let entry = cache.get(file);
        if (entry?.key !== key) {
          entry = { key, digest: createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
          cache.set(file, entry);
        }
        add(entry.digest);
      } else throw new Error(`Unsupported identity input: ${file}`);
    }
    for (const source of sources) visit(path.join(root, source));
    // Workspace-local installations as well as the hoisted dependency tree.
    visit(path.join(root, "node_modules"), true);
    for (const source of sources.filter(f => path.basename(f) === "package.json")) visit(path.join(root, path.dirname(source), "node_modules"), true);
    return hash.digest("hex");
  };
}
