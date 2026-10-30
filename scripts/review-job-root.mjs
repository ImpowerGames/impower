import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Every review job directory (plans, journals, prompts, diffs, reviewer
// directories and probe checkouts) lives under one root beside the worktrees
// root: <parent>/<repo>.review-jobs/pr-<P>/round-<R>/. It sits outside every
// worktree, and the clean-worktrees script finds it from the main checkout.
export const jobRootOf = (mainRoot) => path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.review-jobs`);

// The main checkout is the parent of the common Git directory, which every
// worktree of the repository shares.
export function reviewJobRoot(cwd) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8", windowsHide: true }).trim();
  return jobRootOf(fs.realpathSync.native(path.dirname(common)));
}

// A standalone check's scratch folder under the job root, for checks whose
// fixtures must satisfy the root (or, for Codex, lie outside TEMP). Its
// owner journal names this process, so clean-worktrees removes a folder a
// killed run left behind once the process is gone.
export function testScratch(prefix, from) {
  const root = reviewJobRoot(from);
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, `test-${prefix}-`));
  fs.writeFileSync(path.join(dir, "owner.jsonl"), JSON.stringify({ event: "test-owner", pid: process.pid }) + "\n");
  return dir;
}

// The files under a PR's job directory (`pr-<P>`) where the review workflow
// writes launch plans, journals and launcher logs: its round directories and
// the launch-state and supervisor job directories inside them, under any name
// the launcher accepts. A reviewer's workspace (`reviewer-<id>-<attempt>`), a
// reviewer tool's private home the launcher creates (`codex-home-*`,
// `gh-config-*`), a Git checkout or clone, an install and a package cache
// hold none of these, and reviewers fill them with probes, caches and
// fixtures that can hold copies of other PRs' journals, so the walk never
// enters one. Each file comes with its size from a single stat, sorted by
// name within its directory. An entry removed while the walk reads it (a
// reviewer deleting its probe) is skipped.
export const NOT_JOB_STATE = /^(?:reviewer-.*|codex-home-.*|gh-config-.*|\.git|node_modules|npm-cache|\.npm|_cacache)$/;
const vanished = (error) => error.code === "ENOENT" || error.code === "ENOTDIR";
export function reviewJobFiles(jobDir) {
  const files = [];
  const walk = (directory) => {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch (error) { if (vanished(error)) return; throw error; }
    if (directory !== jobDir && entries.some((entry) => entry.name === ".git")) return;
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (!NOT_JOB_STATE.test(entry.name)) walk(file); continue; }
      if (!entry.isFile()) continue;
      let size;
      try { size = fs.statSync(file).size; }
      catch (error) { if (vanished(error)) continue; throw error; }
      files.push({ file, size });
    }
  };
  walk(jobDir);
  return files;
}

const lexicallyInside =(child, parent) => {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
};

// The nearest existing ancestor of a path, resolved through any link, so a
// junction under the root that points elsewhere does not count as inside it.
const resolvedExisting = (p) => {
  let existing = p;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return null;
    existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), path.relative(existing, p));
};

// Both sides are compared after resolution, which also expands a Windows 8.3
// short name (C:\Users\RUNNER~1) that git never prints.
export function isInsideJobRoot(p, root) {
  const resolvedRoot = resolvedExisting(path.resolve(root));
  const resolved = resolvedExisting(path.resolve(p));
  return !!resolvedRoot && !!resolved && lexicallyInside(resolved, resolvedRoot);
}

// Refuses, naming each one, the paths that lie outside the root.
export function assertInsideJobRoot(entries, root, where) {
  const outside = entries.filter(([, p]) => typeof p !== "string" || !isInsideJobRoot(p, root));
  if (outside.length) throw new Error(`Review job paths must lie under ${root} (${where}): ${outside.map(([label, p]) => `${label} ${p}`).join("; ")}`);
}

// Whether reviewJobFiles skips a path under a PR's job directory: a directory
// between `pr-<P>` and the path (the path itself too, for a directory) has a
// name the walk skips or holds `.git`. A path outside every `pr-<P>`
// directory is never walked, so it is not refused here.
function skippedByWalk(p, root, kind) {
  const resolvedRoot = resolvedExisting(path.resolve(root));
  const resolved = resolvedExisting(path.resolve(p));
  if (!resolvedRoot || !resolved) return false;
  const parts = path.relative(resolvedRoot, resolved).split(path.sep);
  if (!/^pr-\d+$/.test(parts[0])) return false;
  const directories = kind === "directory" ? parts.slice(1) : parts.slice(1, -1);
  let directory = path.join(resolvedRoot, parts[0]);
  for (const name of directories) {
    directory = path.join(directory, name);
    if (NOT_JOB_STATE.test(name) || fs.existsSync(path.join(directory, ".git"))) return true;
  }
  return false;
}

// Refuses, naming each one, a plan, journal or job directory the review-job
// readers would never see, so no launch is hidden from the dead-launch sweep,
// the review checkpoint or the merge gate. Entries are [label, path, kind],
// with kind "file" or "directory".
export function assertWalkedJobState(entries, root) {
  const hidden = entries.filter(([, p, kind]) => typeof p === "string" && skippedByWalk(p, root, kind));
  if (hidden.length) throw new Error(`Review job state must not lie inside a reviewer workspace (reviewer-*), a reviewer tool home (codex-home-*, gh-config-*), a Git checkout, node_modules or a package cache (npm-cache, .npm, _cacache), which the review-job readers skip; use a launch-state directory such as launch-<reviewer-id>-<attempt>: ${hidden.map(([label, p]) => `${label} ${p}`).join("; ")}`);
}

// Resolve the existing readable directory without creating it or disturbing
// permitted pre-launch artifacts. Containment remains the caller's check.
export function assertReviewerDirectory(directory) {
  let resolved;
  try {
    resolved = fs.realpathSync.native(directory);
    if (!fs.statSync(resolved).isDirectory()) throw new Error("not a directory");
    fs.readdirSync(resolved);
  } catch (error) {
    throw new Error(`Reviewer directory ${directory} must be an existing readable directory; create a fresh empty directory before building the prompt or launching (${error.message})`);
  }
  return resolved;
}
