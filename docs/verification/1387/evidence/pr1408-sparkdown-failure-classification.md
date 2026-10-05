# PR1408 completed Sparkdown CI failure classification

SAME writer: gpt-6.1-sol/high; original dedicated worktree, HEAD f5b2b6918f5ac70ef3046e29256fba6919a6af26. Source and committed 58a1 artifacts unchanged. This is an INCOMPLETE unready draft, not an accepted dependency.

Job111562127062/run37245374371: actual assertion exit1; 70 failed/11398 passed/827 skipped (12295), 22 failed/449 passed/5 skipped files (476),1261.42s. Full raw downloaded successfully and retained at pr1408-sparkdown-failure.log, SHA256 502307cd9907a1913ca976fbe3c95c3d358a3a9c50e7cfdc28ca51a40e595447. All failure detail lines7661–8675 were read contiguously in five nontruncated chunks (a09775,7145af,9835c8,ac95cc,cf909e); all70 heading records read separately. The earlier combined source diff output9b758e was truncated; no full-diff claim from that output. This failure is not heap exhaustion, a crash, timeout or a partial suite.

## Counts and disposition

- 10: known required reuse RED.
- 2: query-role failure.
- 14: unexpected multiline-comment regression.
- 41: unexpected canonical & reader/consumer failure.
- 1: unexpected ordinary-comment cache regression.
- 2: unexpected runtime output mismatch.

The10 required REDs preserve shifted executable/derived typeof checked3vs1, generic/default-pack checked2vs1, and final shifted-VM-error checked3vs1. The first8 fail at acceptance134 after first-shift current facts/scalar/full warm-fresh diagnostics; later repeated shift and semantic mutation tails are not reached. The2 error-consumer controls complete their owner-shift/borrower-error/full message/reset/restoration comparisons before final reuse90.

Readonly2 fail at acceptance105 BEFORE no-op/shift/semantic-change tails. observe() selects handle(flow) for scope metadata; fixture.flow writes view["key"]. The source-backed assigned-import rejection remains intentional and the separate31 role-corrected tests prove owner/borrower cases; this acceptance file still queries the writing borrower as a positive. Initial native diagnostic/scalar/warm-fresh parity passes; no owner-supported observation or reuse assertion reached in these2 CI failures. No correction or waiver made here.

All58 remaining failures are unexpected and stay open. The41 ampersand-related cases include malformed AST/errors and missing downstream warnings/output assertions; their individual primary failures are listed below. Tokenizer.read at602–608 now lexes LuauExplicitStatementMark inside canonical/explicit function ancestors as a symbol, unlike base mark tokens. The current branch still carries baseline grammar/tests accepting canonical function markers; planned1374 integration is not evidence of a fix or authorization to dismiss failures. The14 multiline-comment cases correspond to new physicalEnd clipping in returnSuffixSpan519–535 and story-return suffix1730–1740; recorded failures include extra unfinished-comment errors, shortened ranges and syntax/AST disagreement. No runtime reproduction or source repair performed. Ordinary comment reuse failure8292 has equal warm/fresh output but checked1/reused2 versus required0/3; unitKey3693 includes comment kind/location, so longer ordinary comment changes its cache key. The2 chained-call runtime cases produce nil concatenation/Got0 instead of expected output; fixture source contains marked calls in run wrappers, but their complete causal attribution is still unproved, not silently combined with the41 primary error assertions.

## Every failed assertion

| Raw line | File | Reported case | Classification |
|---|---|---|---|
| 7663 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted unchanged executable type fun…' meets unchanged export reuse (ast) | known required reuse RED |
| 7664 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'unrelated private edit with derived t…' meets unchanged export reuse (ast) | known required reuse RED |
| 7665 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted unchanged executable type fun…' meets unchanged export reuse (source) | known required reuse RED |
| 7666 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'unrelated private edit with derived t…' meets unchanged export reuse (source) | known required reuse RED |
| 7685 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted generic type default' meets unchanged export reuse (ast) | known required reuse RED |
| 7686 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted generic pack default' meets unchanged export reuse (ast) | known required reuse RED |
| 7687 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted generic type default' meets unchanged export reuse (source) | known required reuse RED |
| 7688 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted generic pack default' meets unchanged export reuse (source) | known required reuse RED |
| 7707 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted readonly indexer' meets unchanged export reuse (ast) | query-role failure |
| 7708 | src/tests/analysis-backend/source-metadata-acceptance-gaps.test.ts | 'shifted readonly indexer' meets unchanged export reuse (source) | query-role failure |
| 7727 | src/tests/analysis-backend/typefunction-shifted-error-location.test.ts | shifted owner then borrower-only runtime error keeps current native locations (ast) | known required reuse RED |
| 7728 | src/tests/analysis-backend/typefunction-shifted-error-location.test.ts | shifted owner then borrower-only runtime error keeps current native locations (source) | known required reuse RED |
| 7747 | src/tests/compiler/NarrativeReturnProjection931.test.ts | independent narrative-return oracle projection > keeps the complete multiline comment before a synthetic closer: --[[ a | unexpected multiline-comment regression |
| 7749 | src/tests/compiler/NarrativeReturnProjection931.test.ts | independent narrative-return oracle projection > keeps the complete multiline comment before a synthetic closer: --[=[ é😀 | unexpected multiline-comment regression |
| 7751 | src/tests/compiler/NarrativeReturnProjection931.test.ts | independent narrative-return oracle projection > keeps the complete multiline comment before a synthetic closer: ; --[[ é😀 | unexpected multiline-comment regression |
| 7774 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: return 5 --[[ unfinished | unexpected multiline-comment regression |
| 7776 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: return 5 --[=[ unfinished | unexpected multiline-comment regression |
| 7778 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: return 5; --[[ é😀 | unexpected multiline-comment regression |
| 7781 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: return 5 --[=[ é😀 | unexpected multiline-comment regression |
| 7817 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: do return 5 --[[ unfinished | unexpected multiline-comment regression |
| 7819 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: repeat return 5 --[[ unfinished | unexpected multiline-comment regression |
| 7865 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > pins raw native message and document range: do if true then return 5 --[=[ unfinished | unexpected multiline-comment regression |
| 7924 | src/tests/compiler/ReturnCommentSuffix931.test.ts | return suffix comments retain native diagnostics and incremental positions > unrelated following prose still reuses the checked unit | unexpected multiline-comment regression |
| 7957 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return; includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7958 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return 5; includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7959 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return 1, 2; includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7960 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return 5; -- comment includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7961 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return 5; --[[comment]] includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7962 | src/tests/compiler/ReturnSemicolonRange931.test.ts | written return semicolon locations > function & return 5 --[[comment]]; includes its written delimiter | unexpected canonical & reader/consumer failure |
| 7983 | src/tests/compiler/luauOfficialAst.test.ts | Official Luau AST, including document positions > grammar/luau-function/bounded-expression-family.sd | unexpected multiline-comment regression |
| 8005 | src/tests/compiler/luauOfficialAst.test.ts | Official Luau AST, including document positions > grammar/luau-function/story-return-text.sd | unexpected canonical & reader/consumer failure |
| 8027 | src/tests/compiler/luauSyntaxAgreement.test.ts | Sparkdown and Luau's parser agree on which Luau inputs have syntax errors > grammar/luau-function/bounded-expression-family.sd | unexpected multiline-comment regression |
| 8044 | src/tests/compiler/luauSyntaxAgreement.test.ts | Sparkdown and Luau's parser agree on which Luau inputs have syntax errors > grammar/luau-function/story-return-text.sd | unexpected canonical & reader/consumer failure |
| 8061 | src/tests/compiler/luauTreeAst.test.ts | The AST read from the syntax tree is the AST Luau's parser reads > grammar/luau-function/bounded-expression-family.sd | unexpected multiline-comment regression |
| 8082 | src/tests/compiler/luauTreeAst.test.ts | The AST read from the syntax tree is the AST Luau's parser reads > grammar/luau-function/story-return-text.sd | unexpected canonical & reader/consumer failure |
| 8103 | src/tests/compiler/luauTreeAst.test.ts | Unfinished and boundary input > marked breaks keep their following statements in the block | unexpected canonical & reader/consumer failure |
| 8125 | src/tests/compiler/luauTreeAst.test.ts | Unfinished and boundary input > a marked Luau return reports the required block closer at the following token (#1298) | unexpected canonical & reader/consumer failure |
| 8147 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > reports Luau's syntax error for marked function | unexpected canonical & reader/consumer failure |
| 8148 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > reports Luau's syntax error for marked do | unexpected canonical & reader/consumer failure |
| 8149 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > reports Luau's syntax error for marked then | unexpected canonical & reader/consumer failure |
| 8192 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > accepts final Luau returns and multiline return values: function f() | unexpected canonical & reader/consumer failure |
| 8197 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > accepts final Luau returns and multiline return values: function f() | unexpected canonical & reader/consumer failure |
| 8202 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > accepts final Luau returns and multiline return values: function f() | unexpected canonical & reader/consumer failure |
| 8228 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > keeps the existing unreachable warning alongside the marked function's syntax error | unexpected canonical & reader/consumer failure |
| 8262 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > marked bare returns keep Luau's multiline values in function blocks | unexpected canonical & reader/consumer failure |
| 8263 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > marked bare returns keep Luau's multiline values in do blocks | unexpected canonical & reader/consumer failure |
| 8264 | src/tests/compiler/returnFinalStatement1298.test.ts | return is the final Luau statement in its block (#1298) > marked bare returns keep Luau's multiline values in if blocks | unexpected canonical & reader/consumer failure |
| 8292 | src/tests/compiler/typecheckIncremental.test.ts | incremental type checking > an edit to a comment in a scene's Luau reuses the scene | unexpected ordinary-comment cache regression |
| 8315 | src/tests/luau-conformance/LeadingDotContinuation.test.ts | explicit statement runs | unexpected canonical & reader/consumer failure |
| 8337 | src/tests/luau-conformance/Run.test.ts | run statement > loads a .luau file and runs its body: run "helpers" | unexpected canonical & reader/consumer failure |
| 8338 | src/tests/luau-conformance/Run.test.ts | run statement > loads a .luau file and runs its body: run "helpers.luau"  # tag | unexpected canonical & reader/consumer failure |
| 8339 | src/tests/luau-conformance/Run.test.ts | run statement > loads a .luau file and runs its body: run 'helpers'	 | unexpected canonical & reader/consumer failure |
| 8340 | src/tests/luau-conformance/Run.test.ts | run statement > loads a .luau file and runs its body: run helpers | unexpected canonical & reader/consumer failure |
| 8361 | src/tests/luau-conformance/TypeFunctionDeclaration.test.ts | type function declaration > code after it in a run file stays in the file's function | unexpected canonical & reader/consumer failure |
| 8383 | src/tests/runtime/BoundedExplicitBlock931.test.ts | unfinished bounded headers yield scene and branch ownership > a real function's & return preserves its multiline parenthetical | unexpected canonical & reader/consumer failure |
| 8404 | src/tests/runtime/Evaluation.test.ts | Evaluation — ported from ink fixture rewrites > EvaluateFunction mid-narrative preserves call-stack state across calls | unexpected canonical & reader/consumer failure |
| 8425 | src/tests/runtime/Evaluation.test.ts | Evaluation — ported from ink fixture rewrites > factorial by reference (table param as pseudo-ref) | unexpected canonical & reader/consumer failure |
| 8448 | src/tests/runtime/LocalValueList.test.ts | a local's value list > reads a name in an explicit statement as a value | unexpected canonical & reader/consumer failure |
| 8474 | src/tests/runtime/Logic.test.ts | Logic — ported from ink fixture rewrites > nested pass by reference (table param as pseudo-ref) | unexpected canonical & reader/consumer failure |
| 8497 | src/tests/runtime/RepeatLocalBeforeUntil.test.ts | a repeat loop whose until is read inside a statement > is reported inside a closed block of the loop | unexpected canonical & reader/consumer failure |
| 8518 | src/tests/runtime/StoryReturnText931.test.ts | unmarked return in story scope is ordinary displayed text > a real function keeps its multiline do block: & do | unexpected canonical & reader/consumer failure |
| 8521 | src/tests/runtime/StoryReturnText931.test.ts | unmarked return in story scope is ordinary displayed text > a real function keeps its multiline do block: & do | unexpected canonical & reader/consumer failure |
| 8546 | src/tests/runtime/StoryReturnText931.test.ts | unmarked return in story scope is ordinary displayed text > a function expression keeps its multiline code body | unexpected canonical & reader/consumer failure |
| 8547 | src/tests/runtime/StoryReturnText931.test.ts | unmarked return in story scope is ordinary displayed text > a & function expression keeps its multiline code body | unexpected canonical & reader/consumer failure |
| 8568 | src/tests/runtime/TrailingCommaReassignment.test.ts | Luau code: a reassignment list continues after a trailing comma > an extra value for a single target after `&` is still evaluated (in a function body) | unexpected canonical & reader/consumer failure |
| 8569 | src/tests/runtime/TrailingCommaReassignment.test.ts | Luau code: a reassignment list continues after a trailing comma > an extra value for a single target after `&` is still evaluated (to a field target in a function body) | unexpected canonical & reader/consumer failure |
| 8590 | src/tests/runtime/TrailingCommaReassignment.test.ts | evaluation order of targets and values > an extra value after `&`: the target's key first | unexpected canonical & reader/consumer failure |
| 8611 | src/tests/runtime/smoke.test.ts | runtime test harness smoke > table-typed store: read + property-access via dotted name | unexpected canonical & reader/consumer failure |
| 8632 | src/tests/program/programCallArguments.test.ts | a call, an index or a method chained on a call > stores and compounds through what a call returns in an explicit statement | unexpected runtime output mismatch |
| 8655 | src/tests/program/programCallArguments.test.ts | a call, an index or a method chained on a call > calls through the links after a call in an explicit statement | unexpected runtime output mismatch |

## Preservation

No tests, typecheck, native compile/relink, artifact replacement, production edit, integration or review launched for this diagnosis. git status --porcelain was empty at602619; exact HEAD unchanged. Current CI27 checks:21SUCCESS,3FAILURE (Sparkdown, aggregate test-suite, reproducible-build),3SKIPPED,0pending. Existing skipped827 are suite summary, not introduced exclusions. Both native reproducibility and package regressions must be corrected and independently verified before readiness. Parent owns follow-up sequencing; the human preservation request holds implementation/runtime.

