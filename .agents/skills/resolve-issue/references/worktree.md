# Prepare an isolated issue worktree

All commands run from the worktree root unless stated otherwise.

## 0. Preflight

Run this first, every time. Each check here fails late and expensively if you skip it: a near-full `C:` silently corrupts a fresh worktree's `node_modules`, and a logged-out `gh` only bites after all the work is done.

```bash
node .agents/skills/drive-web-editor/driver.mjs preflight
```

Expected, all five PASS (`launches (fallback build: ...)` on the Playwright line is still a pass, and so is `not installed` on the last one before the install below):

```
PASS  disk headroom  — 61.5 GB free (need ~6 GB for a fresh worktree install)
PASS  playwright chromium  — launches
PASS  gh auth  — needed to read the issue and open the PR
PASS  git repo  — C:\...\impower.worktrees\impower\issue-214-fix-455354
PASS  node_modules  — esbuild and vitest both run
```

If disk headroom fails, free space before creating the worktree: the clean-worktrees skill (`node .agents/skills/clean-worktrees/clean-worktrees.mjs`, from the main checkout, dry run first) removes the worktrees whose work is already on `main`.

---

## 2. Create the worktree

Never work on `main`, and never reuse another issue's worktree.

The branch is `<type>/<issue>-<slug>`, and the worktree path is that same string under `../impower.worktrees/` (a sibling of the repo checkout): `fix/302-filterimage-layers` lives at `../impower.worktrees/fix/302-filterimage-layers`. `<type>` is the commit-prefix vocabulary (`fix`, `feat`, `perf`, `docs`, `test`, `refactor`, `ci`); a Bug takes `fix`, a Feature `feat`, and a Task the type of the work it produces (`refactor`, `docs`, `test`, `perf`, `ci`). `<issue>` is the bare number, first, so branches sort by ticket. `<slug>` is 2–4 dash-separated words naming the defect or capability, not the area (`filterimage-layers`, not `sparkdown-compiler`).

```bash
git fetch origin main
git worktree add -b fix/302-filterimage-layers ../impower.worktrees/fix/302-filterimage-layers origin/main
```

If the checkout you are launched from is itself a worktree, resolve the sibling directory from the main checkout (`git worktree list | head -1`) rather than from `../`. Where worktrees live is a local preference: follow whatever `git worktree list` already shows rather than creating a second layout. `git worktree add` creates the `<type>/` directory, and removing the worktree leaves it behind empty; `rmdir` it.

A fresh worktree has no `node_modules`. Install dependencies when the work will run anything from `node_modules` (a build, a test, the driver's browser commands); a hooks-only, skills-only or docs-only change skips the install, and the preflight's disk check still runs. The monorepo is npm workspaces, so install once at the new worktree's root, always with the variable set:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

A bare `npm install` fails outright here: a workspace pulls in `@playwright/browser-chromium`, whose install script fetches a Chromium build from `cdn.playwright.dev`, a host outside this network's allowlist, and npm aborts the whole install on that 403. Skipping the download is safe; the driver runs against the Chromium build the sandbox pre-installs under `PLAYWRIGHT_BROWSERS_PATH`.

The install takes several minutes and roughly 2–3 GB. Run the preflight again afterwards: its `node_modules` line executes `esbuild` and `vitest` rather than measuring them, because a full disk leaves an install that looks complete and is not (truncated binaries, empty package directories, a missing `dist/*.mjs`) and surfaces much later as a baffling build error. A `FAIL` there names the one-pass repair; the line also passes, with a note, in a worktree that deliberately has no install.

Everything from here runs inside the new worktree.

---
