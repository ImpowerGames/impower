# Incomplete preservation checkpoint: #1381

Paused at the user's request. This branch is an unfinished checkpoint, not accepted implementation. The coordinator mechanically preserves the original writer's files; no new implementation, integration, tests or review began during preservation.

Branch: `codex/test/1381-nonstrict-fixture-support`. Exact original base: [4de74e79596082b7274cb67b5426411f7feda2a9](https://github.com/ImpowerGames/impower/commit/4de74e79596082b7274cb67b5426411f7feda2a9). The ticket comment records the exact pushed preservation commit.

## Complete and incomplete work

Fixture configuration/diagnostic observations and old checker support; four archived native probes and remaining contract census.

#1388 current configuration and registration operations; #598 complete transcription; #879 parser.

The architecture selected for #589 is the official pinned Luau checker and VM in WASM behind a persistent incremental bridge. Historical TypeScript-checker changes here must be reconciled with that choice before integration; preservation does not approve them as the production architecture.

## Checks and review

Historical private native acceptance: 3 passed, then 5 passed. Remaining first-begin/table-state/registration/configuration domains not verified.

These are historical results recorded by the original writer, not a rerun on this checkpoint. No new tests, build, install, integration or review was authorized. CI is deliberately skipped for the preservation commit; pending/skipped gates are not passing evidence. Independent review rounds used: 0; last independently reviewed commit: none. Planned next round: two serial independent review lenses after correction and verification; coordinator cap six rounds. No readiness or merge authorization applies during this pause.

## Resume

1. Fetch this branch and check out the exact SHA in the ticket checkpoint. Read #589's stopping checkpoint and #1388/#1387 dependency status before editing. Resume the original Sol 6.1 writer at the ticket's Effort setting.
2. Read this document and the adjacent evidence files. Reconcile the unfinished fixture/port with the published native API; coordinate shared-file ownership before integration. Do not rerun private cross-worktree probes as portable tests.
3. After the user resumes work and dependencies are available, install from the repository lockfile and use the named-file runner. The original owned test command is:

```text
node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/checkerConfiguration.test.ts src/tests/luau-conformance/diagnosticObservations.test.ts src/tests/luau-conformance/nonstrictFixture.test.ts --wait 600
```

For a multi-package change, use the package and corresponding relative test paths in `owned-files.json`; do not pass tests across packages in one invocation. This is the next eventual verification command, not permission to execute during the pause.

## Portability and artifact inventory

`owned-files.json` records the deliberate source allowlist. `evidence/` contains selected original draft matrices/contracts and historical progress, not browser profiles or credentials. Historical notes may mention superseded plans and local paths; current instructions in this README take precedence. Original absolute paths identify old evidence only: use the repository-relative source paths and published dependency branches from tickets #1388 and #1387 when reconstructing inputs.

Untracked native probes, when present, are preserved as text under `historical-probes/` instead of enabling machine-specific tests in CI. Recreate their input manifest from the chosen checkout's hashes; do not reuse historical hash manifests or assume an old artifact qualifies a new source. The original local copies remain intact.

Machine prerequisites: repository-supported Node/npm and installed dependencies; pinned Luau checkout at `7d5f73364fdbbaa984fa545071630eba73cfea98` and Emscripten 4.0.10 if rebuilding WASM (use the maintained native build script). Original object caches, SDK installation, node_modules, browser profiles, raw process/readiness dumps and private screenshots are not published and are not required to recover source. Live verification must be repeated with a fresh isolated browser profile. No worktree was deleted.

