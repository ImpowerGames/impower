# Add a missing package test harness

All commands run from the worktree root unless stated otherwise.

If the package has no tests at all, set it up; do not skip the test. Most packages here have no `vitest.config.ts` yet, and standing one up is part of landing a fix rather than a reason to land it untested; a session that is only filing a bug hosts its repro where a harness already exists (file-bug says where) and leaves the setup to the fix. Use `packages/opfs-workspace` as the template, three pieces:

1. `vitest.config.ts` at the package root. Copy `packages/opfs-workspace/vitest.config.ts` verbatim and keep its `pool: "forks"` + `singleFork` + `fileParallelism: false` settings; parallel runs OOM this machine.
2. `"test": "vitest run"` in the package's `scripts`, and `vitest` in its `devDependencies` (match the version other packages use, `^2.1.9`).
3. A `test/` directory holding `*.test.ts`.

Then `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at the repo root (workspaces; never inside the package, which creates a stray per-package lockfile the root `.gitignore` deliberately ignores).
