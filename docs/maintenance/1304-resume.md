# Resume #1304: incomplete draft preservation

This branch preserves unfinished work. Do not merge or mark ready from these receipts.

Verification base: f5837205e8ec617c0f385c7d1346359d0174cfcc, the unmerged #1374/#1402 dependency head integrated into this branch. Actual accepted-main integration remains required. The human revoked earlier merge authorization while stopping work for a later session.

## Preserved change and evidence

LuauUntilStatement is added to LUAU_STATEMENTS, and exactly #1304's syntax exception is removed. Compiler and differential tests contain the portable original reproductions and all controls. No grammar, converter, or language-server source was edited for this ticket.

On the verification base plus the change: protected compiler red/green had 8 failures and 6 passing controls on the base, then 14/14 passed on the fix; sole-source restoration matched SHA256. Differential controls passed 2/2 on TestProgramStory without fallback. Three actual official C++ WASM oracle files passed 477 tests (syntax134, tree171, official172), no skips. Exact compiler and language-server typechecks passed 2/2 with jobs1. Oracle stderr was nonempty, including runtime-export NullException and reserved-temp messages also present in the recorded historical baseline; this is syntax/AST verification, not a runtime-conformance claim.

Keep exactly #1309's two intentional integer limitations, integers.luau and integers_regspill.luau. Remaining syntax bug exceptions are #1305 and #1306; structural and official AST exception lists remain empty.

## Next action and bounded verification

Read current AGENTS.md and resolve-issue skill, inspect #1374/#1402 state, establish file ownership and machine execution reservation with the coordinator. Normal-merge final accepted main into this same branch; do not rebase or stash. Compare dependency changes and choose the necessary bounded refresh, rather than automatically repeating every test. No live or independent review gate has completed for this fix.

Supported commands, when authorized and resource guards pass:

```text
node .agents/skills/drive-web-editor/driver.mjs preflight
node .agents/skills/drive-web-editor/driver.mjs redgreen --base origin/main --files packages/sparkdown/src/compiler/typecheck/LuauUnitNodes.ts --test "node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/repeatUnitUntil1304.test.ts --wait 600"
node scripts/test-suite.mjs run packages/sparkdown src/tests/differential/repeatUnitUntil1304.test.ts --wait 600
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/luauSyntaxAgreement.test.ts src/tests/compiler/luauTreeAst.test.ts src/tests/compiler/luauOfficialAst.test.ts --wait 600
npm run typecheck -- --jobs 1 packages/sparkdown/tsconfig.json packages/sparkdown-language-server/tsconfig.json
```

Scope SPARKDOWN_DIFFERENTIAL=1 only to the differential command and clear it after actual exit. Choose redgreen base against the accepted branch point, and inspect red assertions and restoration hashes. Do not claim an unavailable official artifact skip is a pass.

## Pending live plan

Use protected in-place snapshots of ONLY LuauUnitNodes.ts for the base/fix source cycle. Stop every owned server before swapping source; do not create another checkout/install. Historical screenshots predate dependency integration and cannot replace refreshed exact-source evidence.

Valid web fixture is the original multiline script in the compiler test. Extension adds an independent scene MAIN/Done./end for breadcrumb response. Strict fixture is:

```sparkdown
---
typecheck: strict
---
repeat local n: number = 1 until n + true > 3
Finished.
```

Valid baseline and fix both publish no error; runtime completion Count4 is proved by independent tests, while preview scrubbing can show Count1 at its paused position. Changed author behavior is the strict fixture's absent-to-present boolean condition diagnostic.

For web, use committed verify/ui and supported --probe with documented window.__editorProtocol.send: editor/read, then textDocument/diagnosticsSettled with that URI/version, then editor/read again. Require exact frozen fixture bytes/hash, unchanged model version/text, and a nonnull diagnostic result version equal to the current editor version. Preserve full diagnostics. Require boolean-related message on zero-based line3, with the whole range inside the written condition (derive columns from exact fixture bytes); do not guess exact severity, narrower range, or wording before reading the result. Type errors may be warnings. Inspect screenshot pixels.

For extension, full npm run build per source phase avoids a missing PDF worker on a fresh narrow build. Use committed verify, diagnostic hover, and supported DOM text probe to prove the opened fixture and actual breadcrumb/problem output. Preserve native consoleErrors/noise fields; no driver override is needed. Inspect screenshots; do not claim PDF/export verification or clean console from failed=[] alone.

After live evidence, update the draft body with accepted base/head and actual CI state, then follow reserved independent review gates. Request fresh human authorization before merging. #1305 waits for its #879 dependency and this fix's eventual merge; #879 is not a direct dependency of #1304.
