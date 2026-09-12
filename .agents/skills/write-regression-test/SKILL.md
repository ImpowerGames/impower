---
name: write-regression-test
description: Write a behavioral reproduction or regression test. Use reproduction-only mode when filing a bug; use full red/green, suite and typecheck verification when landing a fix.
---

# Write and verify a behavioral test

Commands run from the worktree root unless a package directory is specified.

## Choose the mode

- **Reproduction-only:** for file-bug or initial investigation, use an existing harness, write the smallest assertion matching the symptom, run that file under the resource limits, inspect the failure and retain the evidence. Stop here: do not install a new package harness, run full verification, or require a fix merely to file a bug.
- **Full verification:** for a fix or feature, complete test writing, red/green proof and affected suites below.

## 1. Write the test

Copy a neighboring passing test's imports and fixture syntax. Compiler tests live in `packages/sparkdown/src/tests/compiler/`, runtime tests in `packages/sparkdown/src/tests/runtime/`, Luau tests in `packages/sparkdown/src/tests/luau-conformance/`; other packages use their existing `test/` or `src/tests/`, and the editor uses `impower-dev/test/`. Compiler helpers have a load-bearing import order that primes Container.

Assert the ticket's behavior rather than patch shape. A file already failing wholesale is not a reproduction; compare its original failure set on the base. If a fixing task needs a package with no harness, read [package setup](references/setup.md) before creating one. A filing task uses a script or driver probe instead.

## Resource gate

At most one vitest run at a time across worktrees; check existing processes and wait for exit. Every invocation uses at most a 1024 MB heap and one fork. Before running Vitest, read [safe commands and result verification](references/vitest.md). Missing summaries, worker crashes or partial manifests are not passes, even with exit status zero.

## 2. Prove red/green

For full verification, read [redgreen execution and recovery](references/redgreen.md) before the driver temporarily changes source files. Never use the shared stash. Name every changed source the test exercises, not the test itself. Use HEAD before committing and the pre-fix base (normally origin/main) after committing.

Inspect the actual failing assertion and full saved logs; a nonzero exit or unrelated failure proves nothing. Require restoration hashes to match before proceeding. After interruption, preserve snapshots and compare source/restoration evidence before resuming. Import-breaking reverts and mutation proofs use the reference's controlled fallback.

## 3. Broaden verification

Read [suite, typecheck and standalone gates](references/suites.md) when the fix is ready. Run affected tests, widen to the full applicable typecheck before push, and run `node scripts/check-agent-tooling.mjs` for tooling. Stage new checks first and confirm discovered inventory, expected count, CI triggers and sparse inputs.

Keep exact completed-file and failing-test inventories, red and green assertions, verified counts, platform skips and any incomplete attempts for the PR. Baseline failures must be confirmed on the same manifest, not inferred from equal totals.
