import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
export const tracked = root => git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);

// Source identity uses bytes. Installed dependency identity uses path, link
// target, inode, size, mode, modification and change times: package installs and
// edits invalidate evidence without reading gigabytes of binaries per status.
export function fingerprinter(progress = () => {}) {
  const cache = new Map();
  return function fingerprint(root, files) {
    const hash = createHash("sha256");
    const add = value => hash.update(JSON.stringify(value) + "\n");
    add({ node: process.version, platform: process.platform, arch: process.arch, files });
    const sources = [...new Set([...tracked(root), ...git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)])].sort();
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
        visit(fs.realpathSync(file), dependency);
      } else if (stat.isDirectory()) {
        const real = fs.realpathSync(file);
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
    for (const source of sources.filter(f => f.endsWith("/package.json"))) visit(path.join(root, path.dirname(source), "node_modules"), true);
    return hash.digest("hex");
  };
}
