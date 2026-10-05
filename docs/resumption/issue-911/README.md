# #911 paused resumption checkpoint

Feature #895 is stopped at the human's request until next week. This document is preservation, not authorization to start work. No PR exists for #911; do not create one during the pause. Retain the branch and worktree. Do not start runtime, tests, builds, reviews, integration, merge or deletion until the human resumes the feature and resource admission is renewed.

Branch: `codex/feat/911-table-call-lints`. Verified implementation head: `0b72305555eafd02a09acd9f6d6c6b02c313ece1`. Accepted implementation base: `e39acc2ec7799d29303efdc532b0cd16c72484ef`. The commit containing this checkpoint adds preservation documentation/fixtures only; production and tests remain at the verified implementation bytes. Issue #911's published checkpoint records the exact final preservation SHA.

Original sole writer: gpt-6.1-sol, Medium. No replacement writer or transfer of source ownership. Parent coordinator owns resource grants, merge and optional notification. Upstream behavior is pinned to Luau `c8cf2864adec33eb4eb5b4cc7e0708aa74893ba0`.

## Completed proof and remaining gates

- Protected integrated regression on both collector and compiler: genuine RED 28 expected failures, 27 passes, 28 skips; restored GREEN 55 passes, 28 skips across five named files. Statement-layout 16 cases passed in both phases; 20 not-applicable cases remain intentionally skipped. Both source restorations and tracked blob/index/critical byte checks passed. Authoritative raw evidence remains with the remote operator; no local copy is claimed.
- Direct filtered Sparkdown typecheck: one project clean, 9.3 seconds, after exact restoration.
- Current corpus: 662 repository scripts, 54 Luau conformance scripts, four real project scripts; 772 findings = all 749 actual shared-base findings plus 23 valid additions (12 TableLiteral, one TableOperations, ten DeprecatedApi). Parent read all new source contexts: none removed/shifted, zero real-project findings. Project contents and raw/private corpus data are not included here.
- Actual-method timing bundle built and independently qualified: 390 inputs, 18 frozen pins, full metadata/720-input inventory and current/base provenance. Timing RUN has NOT happened. Bundle SHA `2834b04bbe447d78a164f7ff1e2f6d63fe903dce17212f49a78ed5a77ad7f58a`; receipt SHA `9fa4b38208e23ff64cfbd06098fcd0e79cfc1f56e7a9e49a08286cf485f4fde8`. These private artifacts are frozen, not recreated during the pause.
- Current installed live evidence is NOT complete. Laptop setup is complete only. Six coverage phases, three full rendered diagnostic tooltips, installed language-worker identity, runtime Hello and inspected pixels remain pending.
- Independent review: ZERO reviewers completed. Three serial High lenses are planned: author experience, incremental/program state, then undirected. Initial review-round cap is five and never resets. No reviewed SHA/report exists. CI is not started because there is no PR.

## Scope to preserve

Use the converted AST and shared cached roots/names/uncertain names. Preserve merged #896 infrastructure and #905 statement layouts. Do not add checker coupling or a second parser. Keep the 97-case upstream inventory and exact six-warning read/write-table-property case active once. `TableOperationsIndexer` stays excluded.

The multi-result approximation only recognizes direct global `string.find`. Explicit included-script global namespace/member replacements conservatively suppress marked tail warnings; unknown computed member writes may replace find, known other fields do not. Transparent wrappers use the authoritative inner binding; lexical shadows remain local. Cached overrides recombine every compile, including unchanged candidate scripts when another file is added, changed or removed. Numeric-literal direct global fenv calls remain Information (3), Deprecated tag (2), whole-call ranges. Unknown return packs/inferred arguments remain silent.

## Portable synthetic fixtures

The five files in `fixtures/` are plain synthetic source, stored as `.sd.txt` to avoid adding corpus scripts or making them executable test inputs. After renewed authorization, materialize exact bytes into an owned private `.sd` fixture directory using an editor capability. `main.sd.txt` and `override.sd.txt` form the existing two-file project. Do not add a new fixture or silently change line endings. Their original byte identities are:

| Fixture | SHA256 |
| --- | --- |
| positive.sd.txt | C0F93169F631E882966BCFEBAAA163B98DC5E7707343D5C9038B10FECA4C876D |
| controls.sd.txt | 60108670624144EDFC19F4114076188ED5A86404C98A0F93E354F0BEA10BA4FB |
| main.sd.txt | F18933B6EBC0E9AC17DB9E1EA066F8E9F5847FEA9437C44F67E63BEC6470548B |
| override.sd.txt | E18D7791C83A4882D399868462F3D151331DB96208D4C93ADBFCBE800D1ACDDE |
| hello.sd.txt | 66A045B452102C59D840EC097D59D9467E13A3F34F6494E539FFD32C1BB35F18 |

## Live resumption protocol

Read the committed drive-web-editor skill, driver and actual protocol handlers again if changed. Use one unique owned session/profile/artifact directory and a current source/install/helper receipt with external reviewed hashes. Do not assume ignored Temp files; preserve and explicitly account for each owned scratch file. Exact installed fingerprint covers root and workspace dependencies, Node executable/version/bytes, and actual tools; receipt paths must remain inside the isolated checkout. No extension/native build is needed for this compiler-only scope.

Launch editor/player through supported `preflight`, `up`, `status`. Put `--fresh-sw` BEFORE screens and `--sd`/`--project`/settle/probe on supported `ui` and `verify` calls. Retain actual starts/exits and partial failures. One cold start covers these six phases:

1. Positive fixture: exact three public diagnostics below; inspect markers/page pixels and full rendered tooltip messages. Capture tooltips only if genuinely visible; absent tooltip is an unresolved gap, not an automatic retry. Verify current installed controlling service worker separately from the language worker.
2. Controls: only the zero-index Warning at line 5:18–19; grouped find, disjoint keys, local shadows, no-arg/grouped-numeric fenv remain silent. Inspect actual pixels.
3. Import the SAME two-file synthetic project. Return to active main before reading it. Actual loader rewrites `include override.sd` to `include scripts/override.sd`: initial script membership must be EXACTLY `file://local/main.sd` and `file://local/scripts/override.sd`. Require main bytes equal that canonical rewrite and override public buffer bytes equal the fixture. Initial marked tail is absent; zero/fenv persist.
4. Open the canonical override, edit its source to `Ready.` plus newline using actual editor keystrokes, return main and observe tail present; reapply original override bytes and observe tail absent. Main text AND document version remain identical across all phases; version equality alone is never freshness proof.
5. Delete ONLY canonical override with the supported permanent-delete request. Require actual returned FileData array and recursive canonical absence. Observe tail present and preserve zero/fenv plus every unexpected/missing-include diagnostic. Do not rewrite main or force expected results.
6. Verify main active and canonical source BEFORE final `verify --fresh-sw --sd <hello> --line 1`. Require zero own diagnostics/no errors, actual mounted/programLoaded/preview state and visibly rendered Hello; inspect full page pixels.

Public request shapes (checked against unchanged handlers): `workspace/readDirectoryFiles` with `{directory:{uri:"file://local"}}` returns recursive FileData[]; the directory URI has NO trailing slash. `workspace/readFile` with `{file:{uri}}` returns an ArrayBuffer decoded in the page. Subscribe to matching `editor/didLoad` BEFORE notifying `window/didOpenFileEditor` with `{pane:"logic",panel:"scripts",filename:"scripts/override.sd"}`; retain active target readback and supported settle results. Return through supported Back/logic/main navigation before `editor/read`. Request `textDocument/diagnosticsSettled` with `{textDocument:{uri:mainUri},version:actualMainVersion}` using a bounded 20-second public observation; assert actual expected transitions, retaining timeout/diagnostic metadata. Delete via `workspace/willDeleteFiles` with `{files:[{uri:overrideUri}],mode:"permanent"}`. No fake freshness, private cache reset, forced sleep, alias target or protocol-only tooltip proof.

The language worker must actually load `/sparkdown-language-server.js`; compare physical built bytes, independently fetched HTTP bytes and Chromium Debugger-loaded script bytes (subscribe before enable). Retain maps/identities privately. Nested blob correlation is unavailable and must be disclosed. Supported launcher internal build logs are unavailable; do not invent them. Finally perform supported down/status/status-all even after body failure; require actual helper/driver exits and operator-owned PID/start/descendant, port/listener, browser/state/reservation release census plus final source/install hashes. Never kill unknown processes or treat down/status alone as full release.

Expected diagnostic ranges are zero-based UTF-16. Positive: TableLiteral Warning 2, line 1:25–30, `Table field 'first' is a duplicate; previously defined at line 2`; TableOperations Warning 2, line 2:18–19, `table.insert uses index 0 but arrays are 1-based; did you mean 1 instead?`; DeprecatedApi Information 3/tag [2], line 3:2–12, `Function 'getfenv' is deprecated; consider using 'debug.info' instead`. Cross-file canonical main: zero at line 4:18–19, fenv at line 5:2–12, and restored tail at line 3:18–43 with `table.insert may change behavior if the call returns more than one result; consider adding parentheses around second argument`. Inspect all three full tooltip messages rather than semantic hover text.

## Failure history and scratch disposition

Original live setup failures are preserved. A root-level override edit failed because import canonicalized the real target to scripts/override.sd; no diagnostic transitions were proved. Final preview was the wrong scripts view/blank, so it did not qualify runtime. The next attempt failed before editing because the directory URI had a trailing slash; no edits were attempted. The prepared correction uses file://local, subscribe-before-open, exact membership/active main and real diagnostic transitions. No retry or reseed is authorized by this checkpoint.

The four original untracked files remain in the original worktree, untouched, with a separate byte-identical private preservation snapshot. They are machine-bound historical helpers, not committed portable executables:

| File | SHA256 |
| --- | --- |
| 911-cross-file.mjs | 61A815DE4962D6786662DFDE44CC2F0D9021CB5A13B2541093FE61A4B18C8F18 |
| 911-cross-file-attempt2.mjs | 95C6099A19051B9C2B8D4F39CABF8FE4C87218E3D762BB377E26DB30BFAF93AA |
| 911-cross-file-attempt3.mjs | 72CABEFB394DFD33AE5CDF6D277EC9634B2E34E5C4280DD517D5FD40DAFC9CE1 |
| 911-live-probe.js | E12C09C1F3E83774619B4C798B55F73E0BD6421CAA522015B74CAB8067CA1BA7 |

Do not delete them during the pause or treat old unsuccessful helper execution as current proof. The portable fixtures and protocol above preserve the repro without exposing secrets, project contents, browser data or raw command-line logs.

## Next actions after explicit resume

1. Read issue checkpoint and this document; retain the original writer. Verify exact remote preservation head, implementation/base ancestry and unchanged production/test/fixture byte identities in an isolated checkout with line-ending conversion disabled. Do not assume old machine-specific paths/install exist.
2. Revalidate preflight and actual installation under a concrete resource grant; qualify current installed live evidence with the six phases above and strict release. Root adjudicates missing tooltip evidence.
3. Under a separate all-idle quiet grant, use the already qualified actual-method harness: 18 fresh four-Tree sets, three warmups/fifteen measured, actual validateLints including lookup/collection/override filtering/diagnostic construction/indexing. Persist every duration before metadata; trailing separate parse control. No repeats/discards/prewarm. Parsing/setup/other compiler passes/transport/rendering excluded; zero counts do not prove nonempty conversion cost.
4. No duplicate guarded regression/type/corpus runs without a concrete change. If changed production requires regression after resume, use supported `redgreen --base <accepted base> --files <collector> <compiler>` with the test command naming ONLY LintTableCalls, LintCandidatesStdlib, DeprecatedStdLib, LintNotApplicable and LintStatementLayout through `node scripts/test-suite.mjs run packages/sparkdown ... --wait 3600`. Filtered typecheck is direct `node scripts/typecheck.mjs packages/sparkdown/tsconfig.json --jobs 1`, only after exact restoration and admission.
5. Complete live/performance gaps, then publish an explicitly authorized draft PR with Closes #911 and current evidence; inspect full CI, conduct the three serial High reviews with remaining cap five, freeze through actual reviewer exit, adjudicate/reverify all findings, and perform the post-review sweep. Maintainer merges only exact reviewed head with final CI green. Do not reset review rounds or silently replace writers.

Uninvestigated sweep notes remain one-line candidates: possible stdlib runtime-dispatch mismatch and imported-project compiler-unconfigured errors. Do not investigate them during the pause.
