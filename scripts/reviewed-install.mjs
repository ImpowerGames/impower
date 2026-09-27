import fs from "node:fs";
import path from "node:path";

// The reviewed worktree's install is gitignored, so `git status` cannot see a
// reviewer that relinks, junctions through or deletes it. This fingerprint is
// the cheap part that such damage always changes: the top-level entries, the
// `.bin` shims, and where each `@impower/*` workspace link resolves (null when
// the link dangles).
const list = (directory) => {
  try { return fs.readdirSync(directory).sort(); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
};

export function installFingerprint(root) {
  const modules = path.join(root, "node_modules");
  const entries = list(modules);
  if (!entries) return null;
  const links = {};
  for (const name of list(path.join(modules, "@impower")) ?? []) {
    try { links[name] = fs.realpathSync.native(path.join(modules, "@impower", name)); }
    catch { links[name] = null; }
  }
  return { entries, bin: list(path.join(modules, ".bin")), links };
}

// Names each difference so the coordinator restores exactly those paths.
export function installChanges(before, after) {
  if (!before && !after) return [];
  if (!before) return ["node_modules created"];
  if (!after) return ["node_modules removed"];
  const changes = [];
  const compare = (label, a, b) => {
    const was = new Set(a ?? []), now = new Set(b ?? []);
    const removed = [...was].filter((name) => !now.has(name)), added = [...now].filter((name) => !was.has(name));
    if (removed.length) changes.push(`${label} removed ${removed.length} (${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ", ..." : ""})`);
    if (added.length) changes.push(`${label} added ${added.length} (${added.slice(0, 5).join(", ")}${added.length > 5 ? ", ..." : ""})`);
  };
  compare("node_modules", before.entries, after.entries);
  compare("node_modules/.bin", before.bin, after.bin);
  for (const name of new Set([...Object.keys(before.links), ...Object.keys(after.links)])) {
    const was = before.links[name], now = after.links[name];
    if (was === now) continue;
    if (now === undefined) changes.push(`@impower/${name} removed`);
    else if (now === null) changes.push(`@impower/${name} dangles`);
    else changes.push(`@impower/${name} resolves to ${now}${was ? ` instead of ${was}` : ""}`);
  }
  return changes;
}
