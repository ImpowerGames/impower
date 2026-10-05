# #1362 R1 predicate matrix — stopped, incomplete

The parent conveyed the human stop/preservation request due to the weekly budget. Audit expansion stopped immediately. This is a source-only checkpoint, not a completed 47-row matrix, activated dependency, or verification result.

SAME owner: /root/ticket_1362; rollout 01a1050a-9cdb-7171-b52a-3b5b427aa5b0. Latest inspected actual turn_context on this resume: model gpt-6.1-sol, effort high, turn 01a10972-efc5-71d1-8962-fbc379159b8c. Ticket remains the previously verified Task/High, field 20063482/value 35105687.

The previous completed inventory is retained: 283 cases (222 functions, 61 packs), 311 exact source literals, 656 staged expectation objects. The 47 untranslated predicates remain 15 functions and 32 packs. Seven value-export decisions remain pending; no exclusion was inferred. The previous full findings are in semantic-handoff.md and per-case evidence in case-inventory.json, assertions.txt, and activation-ledger.json.

## Frozen evidence inspected during this resume

- Full ticket-1388/r1-corrected-validation-readiness.md.
- Frozen r1-corrected-source-1791159135559 manifest and session.h.
- Frozen nativeFixture.ts API portion covering handles, facts, packs, overloads, printing, structural error comparisons, and fixture actions.
- Full frozen packages/sparkdown/src/tests/luau-conformance/typecheckNativeQueries.ts.

Frozen snapshot root: C:/Users/Lovelle/.codex/private/orchestrate-589-20261003/ticket-1388/r1-corrected-source-1791159135559. Corrected R1 source is uncommitted and untested according to its readiness record. Its presence cannot count as an activated or verified dependency. No inspection of a later mutable worktree establishes additional area capability.

## Partial shared-query observations

These observations are from typecheckNativeQueries.ts source only; C++ implementation and assertions still need mapping.

- NativeCheckedType.functionFacts reports length from the selected pack head. Direct and flattened properties stay separate. The shared PackFacts result does not expose native size or finite even though native packFacts returns them. Thus the six pending size predicates still require explicit review of the shared assertion seam; head length must not replace size(pack).
- NativeCheckedType exposes hasSelf, instantiated type and pack parameter counts, polarity, primitive, and flattened result handles. The selector supports instantiated type/pack paths, imported TypeFun lookup, and opaque module packs. Presence of these interfaces is not proof of the original 47 predicates.
- overloadAt obtains native ancestry/expression/call/resolved observations, but nativeQuery only selects the resolved type after requiring expression/call/resolved. It does not expose ancestry for the original REQUIRE_GE(ancestry.size(), 2), nor separately express the original expression and call assertions. The five predicates in funcs1268 must be mapped individually.
- kind uses native facts and follows type observations, while tableState explicitly requires rawTable. funcs230 requires an unfollowed raw TableType plus own property f; a followed kind predicate must not replace it. No proposed shared API is finalized here.
- TypeId identity is available through is and explicit follow. Printing, primitive discriminants, raw kind, structural TypeError equality, and TypeId identity remain distinct contracts.
- A TypeFun definition location or diagnostic location can supply line observations, but the two funcs2845 location assertions have not yet been mapped to their original selected object in the frozen implementation.

## Exact next action after an explicit resume

Read the frozen shared harness assertion schema, native case runner/actions, and bounded C++ implementations for these existing API methods. Reuse the 47 pending entries in summary.json and original bodies/macros in case-inventory.json; do not retranscribe the 283 cases. Produce one row per original C++ predicate with original source line, selected object, operation/follow/flatten/printing options, expected value, frozen native observation, shared assertion representation, and remaining owner-specific gap. Keep original old/new solver branches and intentional check sequences explicit.

Then map the three setup sequences: funcs1697 and packs396 require raw assignSource followed by only the original main check; funcs1719 requires real clearFrontend retaining the mutated string.len identity. Frozen R1 provides source for raw assignment, exact check calls, and assertion context, but inspect those implementations before claiming readiness. Quantify the remaining native and shared assertion gaps and propose the smallest finite implementation/test slice for eventual integrated #1387 activation. #593 owns the staged port files; do not edit them or create duplicate transcripts.

No runtime, worktree, install, build, typecheck, CI, browser, source-port edit, shared API edit, PR, reviewer, or background process was started by this resume. All own read commands exited. Original ownership is retained.
