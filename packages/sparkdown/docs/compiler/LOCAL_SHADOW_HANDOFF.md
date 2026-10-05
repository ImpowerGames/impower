# LocalShadow unfinished handoff (#899)

Preserved at the maintainer's stop instruction. This branch is unfinished and has not passed the completion gate. Base: `e39acc2ec7799d29303efdc532b0cd16c72484ef`. Original writer: gpt-6.1-sol, Medium; session `01a104eb-b5e4-7fa0-b008-ccb92d0b6651`. No independent reviews have started. Planned first review round has three High-effort serial reviewers: author experience, shared program state/cache, then undirected. Review cap remains five rounds; do not reset it.

## Preserved implementation

LocalShadow uses original shared AST bindings and facts, caches script-local decisions by Tree, and recomputes global-dependent warnings each validation. Used locals, parameters and loop variables count; plain writes do not establish local use. Underscore and builtin exemptions are intentional. Same-script messages follow pinned Luau; cross-script messages include the selected script path. Bare Sparkle event handler names count as actual reads.

The latest correction seeds the existing expression reader with original lexical bindings for supplemental narrative/interpolation expressions. It retains original block/function ancestry, initializer visibility, sibling isolation and repeat-until body-local visibility. Bare AstExprError placeholders do not certify covered syntax; their actual children and const-target facts still do. No runtime or grammar change was made.

## Actual verification and limits

- Initial behavior reproduction: 20 genuine missing-LocalShadow failures. Earlier protected base/fix run: 29 failures on base, then 133 pass and 11 skip on fix, with production hashes restored. Those results predate the latest lexical-context correction.
- A prior corpus run found 1437 findings versus a shared actual e39 baseline of 749. All 688 additions were audited. Twenty-four confirmed lexical-scope false positives motivated the current correction; its corpus validation is pending. Remaining recovered/unsupported syntax and one synthetic global `run` wrapper collision were separately classified, not suppressed.
- Latest two-file reproduction: 6 fail / 97 pass / 103 total. It exposed lost scene bindings and phantom global reference locations. Eight later focused controls had no separate pre-edit RED.
- Current three-file run: 143 pass / 1 fail / 144 total. All 47 LocalShadow and 33 LocalUnused tests passed. The new ownership control failed on an incorrect test API call before its ownership assertions.
- After correcting only the test import/calls, a separate one-file run passed all 64 name-fact tests, with zero skips. This is not a rerun of all 144. The known match empty-match warning at offset 48 remains; the prior LocalUnused run also warned at 43.
- The earlier filtered typecheck passed before the correction. The current filtered TYPE, fresh corpus build/run, full resulting audit, actual performance, live web editor/extension verification and independent reviews remain undone. No completion or no-false-positive claim is supported.

## Resume sequence (requires renewed authorization)

Start from the exact pushed branch commit and read #895/#899 and repository skills. Dependencies include #608 and merged #896; this base includes accepted #896 name indexing and #905. Do not copy unmerged #910 code. Keep unrelated skipped diagnostics, including DeadLocalsUsed for #901, untouched.

First run the filtered typecheck under resource admission:

```text
node scripts/typecheck.mjs packages/sparkdown/tsconfig.json --jobs 1
```

Any named regression execution uses the canonical machine-wide reservation:

```text
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/LocalShadow.test.ts src/tests/compiler/luauNameFacts.test.ts src/tests/luau-conformance/LintLocalUnused.test.ts --wait 3600
```

Preserve actual session/exit, complete raw stdout/stderr, unchanged input hashes and owned-process release. No install, test or build is needed merely to inspect this commit.

Rebuild the current corpus from `packages/sparkdown/scripts/lintCorpus.ts` via a portable private entry importing its exported `main(repoRoot, authorizedProjectRoot)`. Use all tracked 662 repository scripts and 54 pinned upstream Luau files; add the authorized R&B project only when its actual scripts are available. Never publish private project contents. Preserve fixture membership and byte hashes. The corpus harness currently adds a named global `function run()` wrapper for upstream files; treat its collision explicitly rather than masking a source name.

The immutable builder must record full esbuild physical inputs, dependency/runtime versions, helper/entry hashes, fixture bytes, output bundle and metafile hashes. Normalize only the known literal `?raw` suffix for physical file lookup and preserve original metafile keys. Require all four changed production inputs (collector, compiler, luauNames, readLuauAst) and exact base Git blobs for every other tracked imported production input. Reject unexpected runtime externals. Pin the receipt externally before the separate run, and retain raw streams and postguards.

If the original shared actual baseline receipt and artifacts are unavailable, do not claim their verification in a new session: arrange a separately authorized exact e39 baseline build/run with all four production overlays. Compare ALL-code multisets and inspect every added, removed or shifted finding in actual source context. Explicitly verify each of the 24 prior lexical leaks, not just the net count. Before approval, complete protected red/green with all four changed production sources and verified restoration.

Measure real compiler.validateLints on 18 distinct changed sets of four Trees (72 identities), three warm and fifteen measured iterations, without AST prewarming. Include document lookup, collection, program reindex and diagnostic construction in the timed interval. Preserve raw timing before metadata and run parse controls afterward. Acceptance remains whole-lint R&B main median below 10 ms.

Use supported live drivers for actual warning squiggles/tooltip, runtime Hello, and unchanged-Tree cross-script global-read add/remove behavior. Inspect rendered screenshots. Reassess extension verification because the shared AST reader changed; neither surface has been seen for this corrected source. Only then publish a draft PR with `Closes #899`, read it back, obtain CI and the planned independent reviews. Preserve the worktree and existing review-round count.

## Evidence portability

Implementation, tests and these instructions are in Git. Raw logs, full 688-finding source audit, protected restoration artifacts, old/new corpus helper snapshots, and unexecuted browser fixtures remain in the original writer's private local directory. They are not automatically transferred by a clone. The original R&B bytes, browser state and credentials are deliberately absent from this branch. Reconstruct portable verification from the committed harness and authorized inputs; do not treat missing private receipts or unexecuted helper plans as fresh proof.
