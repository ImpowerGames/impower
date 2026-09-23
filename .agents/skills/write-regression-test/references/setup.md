# Add a missing package test harness

All commands run from the worktree root unless stated otherwise.

If the package has no tests at all, set it up; do not skip the test. Most packages here have no `vitest.config.ts` yet, and standing one up is part of landing a fix rather than a reason to land it untested; a session that is only filing a bug hosts its repro where a harness already exists (file-bug says where) and leaves the setup to the fix. Use `packages/opfs-workspace` as the template, three pieces:

1. `vitest.config.ts` at the package root. Copy `packages/opfs-workspace/vitest.config.ts`, keeping its `include`, `exclude`, `pool: "forks"` and `fileParallelism: false`, and leave out its `poolOptions.forks.singleFork`. `singleFork` shares one environment across the package's files, which fails a `jsdom` package for reasons unrelated to the change; `node scripts/test-suite.mjs run` supplies the one-worker caps, since parallel runs OOM this machine.
2. `"test": "vitest run"` in the package's `scripts`, and `vitest` in its `devDependencies` (match the version other packages use, `^2.1.9`).
3. A `test/` directory holding `*.test.ts`.
4. The package's path in the `package` matrix of `.github/workflows/test-suite.yml`, so the Test Suite workflow runs it on every pull request. The tooling check `.github/scripts/test-suite-matrix.test.mjs` fails when a tracked `vitest.config.ts` has no matrix entry.

Then `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at the repo root (workspaces; never inside the package, which creates a stray per-package lockfile the root `.gitignore` deliberately ignores).
