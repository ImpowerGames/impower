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
