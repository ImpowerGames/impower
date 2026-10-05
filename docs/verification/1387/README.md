# Incomplete #1387 preservation checkpoint

Branch `codex/refactor/1387-incremental-checker`; production checkpoint [f5b2b6918f5ac70ef3046e29256fba6919a6af26](https://github.com/ImpowerGames/impower/commit/f5b2b6918f5ac70ef3046e29256fba6919a6af26); original base [4de40453bbf3fd7d82abd5d7e738e4ea161fc7a7](https://github.com/ImpowerGames/impower/commit/4de40453bbf3fd7d82abd5d7e738e4ea161fc7a7). This preservation commit adds only historical evidence and resume instructions. PR #1408 remains draft. No implementation completion, review readiness or integration approval.

## Actual state

The 52 owned implementation files and generated artifacts were already pushed. Native incremental analysis and its host API remain incomplete. Historical CI: 21 success, 3 failure, 3 skipped; Sparkdown 70 failed, 11,398 passed, 827 skipped. Failures comprise 10 known required reuse regressions, 2 query-role errors and 58 unexpected regressions (41 function marker/canonical-unit, 14 physical-EOL/comment-range/AST, 1 comment-key reuse, 2 chained-call runtime). Focused owner/indexer controls: 31 passed. Required generic/default/derived/type-function reuse remains open.

Reproducibility failed: committed WASM hash starts 58a1, CI rebuild b5a64d2a. Source audit found a concrete private link-order difference, but its sole causal role is unproven. The corrected private builder and 144-object relink plan are SOURCE/PREPARATION ONLY; no relink occurred. Both JS and WASM must match maintained-build output before replacing artifacts.

Independent reviews used: zero; last reviewed commit: none. Initial review with required risk lenses remains, then correction rounds as needed within the coordinator's six-round cap. No new reviews or tests during this stop. Preservation CI intentionally skipped, not green.

## Next action after resumption

Fetch this branch at the exact SHA in the ticket checkpoint, then read `evidence/pr1408-sparkdown-failure-classification.md`, `evidence/pr1408-reproducibility-diagnosis.md`, and `evidence/draft-host-handoff-1389-frozen-api.md`. Resume the original Sol 6.1 High writer. Coordinate #1374/#1388/#1389 and #867 ownership before any integration. Inspect the maintained native build script and reproduce its pinned build before changing committed generated artifacts; do not execute the historical cached relink script on another checkout without adapting and verifying all inputs. Next runtime action is the bounded reproducibility comparison described in `evidence/canonical-private-relink-packet.md`, after new machine/readiness admission, not a broad suite.

## Portable recovery and exclusions

All implementation is in Git. Adjacent evidence preserves original source audits, build plans and incomplete callback proposals. These historical documents contain old absolute paths; they identify original evidence only. On a fresh machine, use this checkout plus #1388's published branch, install repository dependencies from its lockfile, obtain Luau pin `7d5f73364fdbbaa984fa545071630eba73cfea98`, and use Emscripten 4.0.10 with the maintained build script. The private cached relink optimization requires original object files and is not portable; the maintained cold build is the reproducible alternative. No local-only path is required for source recovery.

Unshared artifacts retained on the original machine: SDK and native object caches, immutable duplicate source snapshot (already in Git at f5b2), raw large runtime/readiness/process logs and browser data. No credentials, browser profiles or private real-project screenplay were copied. Recreate isolated browser profiles for future live work. Full real-project incremental/performance acceptance has not run. #1362/#1363 source-only unfinished audits are archived here as dependency evidence; they are not production changes or executed acceptance.

