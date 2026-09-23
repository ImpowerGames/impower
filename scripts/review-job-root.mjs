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
  return jobRootOf(path.dirname(common));
}

const lexicallyInside = (child, parent) => {
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

export function isInsideJobRoot(p, root) {
  const absolute = path.resolve(p);
  if (!lexicallyInside(absolute, root)) return false;
  const resolvedRoot = resolvedExisting(root);
  const resolved = resolvedExisting(absolute);
  return !!resolvedRoot && !!resolved && lexicallyInside(resolved, resolvedRoot);
}
