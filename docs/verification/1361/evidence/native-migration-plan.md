# #1361 native migration — source-only phase 0

SAME original writer `01a10362-bc55-7a12-9a65-91102ea2a6e8`, gpt-6.1-sol/high. REST #1361 remains Task/open/High. Human-selected architecture is the official FULL checker + VM in WASM; no TS solver repair, private VM-prototype import, new interpreter, or hybrid implementation is proposed. This packet records source analysis, not executed native outcomes or activation readiness.

## Immutable inputs and inventory meaning

Native fixture API is published commit `721d95ca3a1b0d81b709d1022d9e1ea87e9f742b`, read exclusively with git show. Live #1388 corrections were not read/imported/edited. The matrix records hashes of nine published API/build source files. `58a1` is a #1387 artifact hash prefix, NOT a Git commit. Its frozen source handoff and receipt were read and SHA256 verified: respectively `1e18409d861f4a6cfb0e6fa8e7774893a089c731d4dd37dc182786c426116d4e` and `2ae23e8a4cd7e0b92bb93ad60d0cab509f7f817650ceb7115187afe58425d7ad`. Those snapshots are source evidence only and cannot become published imports.

`native-migration-matrix.json` contains all384 original case ordinals/names,397 exact source records,680 existing legacy port assertions, complete assertion payloads, source digests, exact upstream assertion evidence, body hashes, fixtures, flags, limits, solver-override evidence and operation recipes. The immutable original full C++ bodies remain in inventory.json. The prior selected-branch semantic audit remains authoritative; the matrix retains both-branch source evidence without treating old/new alternatives as cumulative expectations.680 counts the original port's assertion objects, NOT a claim that all C++ predicates were already transcribed. The known omissions below remain required.

All397 source bytes still match source-byte-audit.json. Dependency assignment sources in cases169/245 are not independent upstream checks: the legacy397 source-record/check objects represent395 original actual check operations once those two fixtures are mapped correctly. These are static inventory counts, not pass/skip totals.

Permanent selected-new-solver exceptions are the20 exact upstream new-solver guards plus case74's explicit force-old switch at1459. Case74 reaches Fixture.cpp331/718–730's old frontend and Frontend.cpp2561/2588's old checker. It remains an old-only exception; no new union bug was established. Original parser records are temporary, including #879's precise entries currently owned by its writer. No parser eligibility edit was made. The malformed fuzzer source case252 retains its precise malformed reason, shared parser rejection, original recovered native check and absence of a zero-errors expectation; it is not a new missing-support exemption.

FancyHashtable is a host definition, not a user-defined class exclusion. Optional executes through the official VM; the generic identity type-function case remains applicable even if a particular instantiation stays blocked. No new runtime exclusion.

## What the published native API already observes

The native fixture retains actual opaque TypeId/TypePackId values. Printing, pointer identity, raw-kind checks and explicit follow stay distinct. mainType follows exactly as upstream requireType; child selectors retain actual property/indexer/metatable/table pointers. facts exposes rawTable/rawPersistent, followed kind, instantiated parameter counts and indexer readonly presence; tableState exposes the actual enum. propertyNames observes own properties, not inherited or synthetic ones. functionPack/packFacts preserve direct versus flattened packs. errorFacts retains actual native error variant/type/pack/scalar/collection data and original indices. printedOptions includes exhaustive plus maxTableLength. No graph serialization or printed-text reconstruction is needed for these table assertions.

The original 680 assertion objects map to existing published operations:356 error-count objects;162 selected-error objects;4 any-error objects;147 named-type selectors;9 position selectors;2 module-return selectors. Fields overlap:112 printed equality,34 kind,29 path,8 identity,67 diagnostic fields,51 messages,26 locations,22 print-option objects,3 line assertions,1 property count. None of these static mappings is an executed result. A raw get<T> prerequisite must still use a raw predicate where upstream did not follow; the generic DSL kind getter follows and is not sufficient by itself.

| Required source predicates omitted by the original port | Exact native recipe / future assertion wiring |
| --- | --- |
| case17 line320 methodArgs size1; case25 line486 fooArgs size1 | functionPack(type,arguments,true).head.length, after function presence/kind checks |
| case38 lines782/792/794 arg size1, equal table states, same arg/result TypeId | flattened actual packs; tableState on followed table children; identical on ORIGINAL arg/return entries, preserving original follow distinctions |
| case42 line894 printed t1 != printed t2 | two printedOptions results inequality, not !identical; no new native operation required |
| case53 lines1093/1098/1099 string builtin print, absent indexer, own a presence | builtin print; require followed TableType then facts.indexerIsReadOnly === null; own propertyNames contains a; no child-error-as-absence heuristic |
| case61 lines1256–1262 raw metatable presence and followed metatable identity | mainType; raw metatable predicate; child(meta,metatable), explicit follow both compared pointers, identical |
| cases76/77/78 lines1513/1538/1563 printed diagnostic table equality and exact candidate sets | errorFacts.types.table printed equality; strings.candidates exact length + Set membership; array-prefix matcher alone is insufficient |
| case87 lines1782–1783 exhaustive wanted/given strings | errorFacts TypeMismatch handles printedOptions({exhaustive:true}) independently, preserving option o |
| case106 line2196 own bad absence | actual TableType own propertyNames excludes bad; public inherited lookup is not equivalent |
| case112 lines2313–2319 direct followed return pack head1, metatable table stateSealed | selectedPack(newFn,returns), followPack, raw direct pack predicate/head length, follow result, child(table), raw TableType + tableState |
| case151 line3142 selected-New arg TableState::Sealed | actual first arg; explicit follow; raw table presence; tableState Sealed, not old Generic alternative |
| case152 lines3194–3201 returned metatable, table metatable contains incr, followed Counter identity | returned actual pack first; follow/get metatable; child(metatable), follow/get table; own incr presence; followed identity |
| cases159/160/161 lines3318–3362 math/a presence, TableType, instantiated params empty | exact requireType lookup; raw followed table prerequisite as original; facts.typeParameters===0 |
| case162 lines3374–3380 inserted foo property location | actual TableType own foo and propertyFacts.location [2,10,2,13], not definition source labels |
| case188 line3958 exhaustive given generic method shape | actual TypeMismatch.given printedOptions exhaustive; this is the selected-New branch, after ignoreMissingAnnotations |
| case199 line4183 absent own empty-string property | followed TableType own propertyNames excludes empty string; preserve selected-New result expectation |
| case220 lines4652–4655 exact new-path mismatch and readonly substrings | actual native diagnostic messageContains for selected enabled NewTypePath branch and modifier phrase; not a message-derived graph fact |

These are shared DSL omissions or area-local explicit observation callbacks, not grounds to expose native graph handles in the production/public API. Metatable path, printed inequality, state-to-state comparison and own-property/indexer absence can use existing direct fixture methods; if a reusable DSL extension is useful, #1388 owns that change.

## Exact fixture operation recipes

case96, upstream1950–2009: SAME Fixture performs check1/check2/check3, then exact loadDefinition at1983, then check4/check5. Matrix embeds exact host-definition bytes with beforeCheck4. Native definition action exists and requires success. The legacy final two notApplicable markers must be removed by the eventual owned integration, preserving source bytes. No definition load before the earlier checks and no reset between checks.

case169, upstream3507–3544: source[Module/Backend/Types] = exact first source; source[Module/Backend] = exact second source; ONE getFrontend().check(Module/Backend). case245, upstream5101–5127: source[game/worker] = exact first source; source[game/library] = exact second source; ONE getFrontend().check(game/library), assert no errors. The current port's two checks must become moduleSources plus a named entrypoint, preserving resolver keys. #1388's pending source-assignment/cache/extern-operation corrections remain prerequisites; #879 owns parser entries. No new check of a dependency and no mode assignment in the direct named operation.

All other original multi-check cases96/98/179/261/262/273 retain a single original fixture and exact order. Fixture construction precedes case-body flags; assertions run before the next mutation invalidates handles. No synthetic independent sessions to hide transitions.

case156, upstream3250–3276, genuine missing finite fixture recipe:

1. Construct parent Fixture and initialize parent getFrontend().
2. Construct child Fixture; initialize child getFrontend(); assign child.globals.globalScope = parent.globals.globalScope (exact line3256).
3. child.check(exact source record156/1).
4. Destroy CHILD frontend/arenas/fixture while parent remains alive.
5. Iterate EVERY parent globalScope.bindings and call official toString on each original binding.typeId (lines3270–3272), only after child destruction.

This is a lifetime/no-crash recipe; it does not assert zero diagnostics or a fabricated graph predicate. A single check, reset, copied globals, separate WASM instances or printing before destruction is not equivalent. Propose one bounded #1388 test-only native operation with fixed exact source input/provenance, actual parent/child scope sharing and completion/error outcome. No UI/public graph API. WASM execution cannot claim ASAN-equivalent coverage; retain source fidelity and disclose sanitizer limits.

## Flags and actual assertion build gap

All15 explicit non-solver flag names/values and selected call-path evidence remain in flag-audit.md and per-case matrix entries.48 cases have flags and4 have numeric limits. Native real scoped FValues replace obsolete TS fixed-true emulation proposals. Numeric settings remain LuauPrimitiveInferenceInTableLimit2 in three cases and LuauTableTypeMaximumStringifierLength40 in one; native flags apply over checks and printing, not only a final type query. Solver guards/overrides retain their separate provenance.

Published721d build.mjs uses compileFlags [-std=c++17,-O2,-fexceptions,-DNDEBUG] without LUAU_ENABLE_ASSERT. Pinned Common/include/Luau/Common.h68–72 changes LUAU_ASSERT to sizeof under that configuration. ConstraintSolver.cpp577–578 therefore cannot evaluate !force when DebugLuauAssertOnForcedConstraint is true. Fourteen table cases require that real dispatch assertion. flagValue/empty diagnostics are not equivalent.

Required bounded contract: faithful conformance assertion instrumentation/build configuration plus a genuine negative control that proves forced dispatch reaches an observable assertion failure, and teardown/isolation outcome. Parent/#1388 chooses assert-enabled native build/handler or exact dispatch observer; do not enable all production debug assertions or fabricate diagnostics. This is a source-proven capability gap; no control or native build was run here.

## Separate production integration acceptance

Proposed disjoint future area-owned path, AFTER publication/ownership grant: NEW packages/sparkdown/src/tests/analysis-backend/native-conformance/nativeTablesProductionAcceptance.test.ts. Keep exact original area data as the source of truth; coordinate a finite read-only corpus/data hook with #1388 rather than duplicating384 sources or importing private snapshots. The existing TypeInfer.tables.test.ts remains #879-controlled for parser eligibility during phase0.

Faithful native fixtures exercise the exact original assertions above. Integrated acceptance exercises the shipped #1386 artifact through #1387's maintained AST/converter/public AnalysisProject or SparkdownAnalysis path. These prove different properties and require separate recorded evidence:

- Compare unchanged raw .luau inputs against maintained converter AST inputs under the SAME actual supported production environment/configuration. Compare actual ordered diagnostic variants/messages/ranges and bounded inferred value-type queries at authoritative owned tokens. Original native byte positions and public UTF-16 must use explicit conversion, not an ASCII-only assumption. No re-emitted/reparsed substitute source or private native fixture artifact on the integrated side.
- Production always registers standard builtins in frozen bridge.cpp269; ordinary Fixture does not, while BuiltinsFixture additionally registers game/workspace/script any globals (Fixture.cpp630/787–803). This is an ENVIRONMENT DIFFERENCE, not automatically a missing production feature. Do not apply a bare Fixture expected vector to standard production builtins. Matrix distinguishes faithful-fixture expectations from production raw-vs-AST behavior. Use supported programEnvironment for applicable production any names; FancyHashtable exact definition uses supported definitions update with its true ordering.
- Public configuration currently contains mode and typeFunctionHeapBytes. Arbitrary case debug flags/numeric table limits, raw identity, module-return packs and error-field graphs are intentionally absent. Specialized fixture proofs own these predicates. No request to expose them publicly or pretend queryType's maxLength is ToStringOptions.maxTableLength.
- Public queryType is positional inferred VALUE type, not arbitrary alias/binding/TypeId/path/pack observation. Query only genuine maintained owned source tokens; report where original structural assertions have specialized proof and where integration establishes diagnostic/value-query equivalence. Do not invent alias expressions or alter exact snippets to get public handles. Unqueryable original predicates are not waived: retain native assertion coverage and production converter/checker proof separately.
- Keep one native production project across intended updates; preserve original source/definition/mode/import changes. Add table-focused warm-vs-fresh controls for field type edits, readonly indexers, captured aliases/type-function bodies, FancyHashtable definition replacement and actual named dependency changes. Use actual checked/encoded/reused counters and scope generations; same messages alone do not prove reuse. No TS solver execution.
- Optional(Config) and generic identity execute through official native VM in faithful fixture plus appropriate production raw-vs-AST controls. Private VM-only measurements remain historical limited feasibility evidence, never production acceptance.

The frozen #1387 API and artifact are unreviewed source baselines; production ownership/publication is pending. #1388's four reproduced review defects/corrections and specialized lifetime/assertion gaps must be resolved before final area activation. No source-phase0 tests, builds, installs, source edits, activation, commit or PR were performed. Historical original forced baseline349PASS26SKIP9FAIL and later6PASS2RED/typecheck-clean remain historical actual results, not native outcomes.
