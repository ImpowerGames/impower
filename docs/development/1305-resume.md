# #1305 unfinished reproduction checkpoint

Safe stop requested by the maintainer. This branch preserves reproduction tests only; the grammar fix is not implemented and the tests intentionally fail.

Base: `d555d4335cf634781ea2e95a901cd8c2f899618a`. Branch: `codex/fix/1305-regex-glued-then`.

## Resume

Retain the existing worktree. Wait for #1374 / PR #1402 and #879 grammar ownership release and #1304 merge. Fetch and integrate those completed dependencies through the repository workflow (never rebase); rerun reproduction on the integrated base before changing production.

Machine prerequisites: authenticated `gh`, Node/npm workspace dependencies installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, sufficient disk, local Playwright Chromium, and all five driver preflight checks passing. Use only the supported named-file test runner:

```text
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/regexGluedThen1305.test.ts --wait 600
node scripts/test-suite.mjs run packages/sparkdown src/tests/runtime/RegexGluedThen1305.test.ts --wait 600
```

Compiler baseline: 22 tests, eight failures solely on `Expected 'then' when parsing if then else expression`, 14 passing controls. The official C++ parser accepts the projected checker text for valid cases. Runtime baseline: eight tests, two soft diagnostic failures, six passes. Independent execution assertions pass: direct forms produce `Result 1 1.`, nested forms produce `Result 2 1.`. Four TextMate/Oniguruma versus spark-morph scope comparisons pass. ProgramStory coverage is unverified: the differential configuration excludes this new runtime file and reported no test files found; do not claim that attempt ran tests.

The ordinary `LuauThenExpression` opener uses a word boundary before consumed `then`, which fails after regex flags. Frozen #1374 also has `LuauSparkdownExplicitThenExpression` with the same opener. Correct both canonical and bounded counterparts without weakening identifier boundaries or the bounded arm's line boundary. Read language-definition instructions, edit YAML sources, regenerate both outputs, and retain genuine missing-then/value diagnostics with correct ownership. Remove only #1305's syntax disagreement after the fix; preserve exactly two #1309 integer limitations. `readLuauAst.ts` remains #1387-owned until released.

Before-live pixels were inspected in the web editor and served VS Code workbench: glued source has one error, spaced source is clean; VS Code hover displays the exact erroneous diagnostic. Capture and inspect fresh after evidence on both applicable surfaces. The web preview logged an undefined `id` page error once; it did not recur and attribution is unproven. Web diagnostic hover returned an empty response. VS Code logged a FileSystemError on both captures while diagnostics settled. Do not broaden scope based on these logs. The drivers were stopped successfully.

No production edits, green proof, filtered typecheck, draft-independent review or readiness gates are complete. Follow resolve-issue through red/green, both grammar engines, executable semantics, live evidence, CI and serial independent reviews. Root coordinates ownership, review capacity and merge; six rounds was the initial authorized cap, with further rounds escalated to root. Keep the PR draft until all gates pass.

Private browser profiles, process census, full logs, local screenshots and installed/build outputs are intentionally excluded from this portable checkpoint. Test sources contain all necessary inline fixtures.
