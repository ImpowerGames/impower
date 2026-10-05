# #1379 exact native action contract — incomplete, 2026-10-04

Same writer: rollout `01a102ca-aa1b-77f2-96bd-fd40f46b1768`, actual `gpt-6.1-sol` / `high`, freshly read from turn_context. Organization Effort High was freshly confirmed by the parent. Official checker + VM decision supersedes the earlier prepared TS changes. Four staged original files remain preserved at base `1337c7f4f2a7496aec3cbbc024b1e5b0e840c50b`; no commit, dependency integration, native rebuild, reviewer, or activation occurred.

Authority: original `tests/TypeInfer.{definitions,metatableOOP,externTypes,classes,modules}.test.cpp` at Luau `7d5f73364fdbbaa984fa545071630eba73cfea98` in the read-only `luau-typecheck-1368` checkout. `parser-audit.json` retains all 18 original raw literals, normalized only by C++ phase-one CRLF-to-LF conversion, with SHA256 and original parser evidence. The private probe extracts the literals again from the original files and requires exact equality and SHA equality against that audit. Previous TS documentation failures are historical evidence, not current native outcomes.

Frozen reader API: `C:/Users/Lovelle/Documents/GitHub/impower.worktrees/codex/test/1388-native-conformance/packages/sparkdown/src/tests/analysis-backend/native-conformance/nativeFixture.ts`, HEAD `22c46d48c5243541303490d8f918540e2c1398bc` plus 32 frozen staged files. WASM SHA `3d1e5e9b97c6c75b2637e7023145cbe4518f4beb3cc2408fc2c927a4f9f82162`; JS SHA `c08d757ecba4da1b77470bfd7aa3715001f56de1bd4162e250f7645abfe73b03`. #1388 remains sole shared writer. This proposal requests bounded dispatch and observations; it does not transfer #597 port ownership.

## Required direct-definition operation shape and ordering

Every original TEST_CASE_FIXTURE constructs exactly one real native fixture. Definition loads, source registrations, checks, and queries use that same fixture; create/reset is only for independent negative controls. Direct intentional failed loads call `observe("definition", exactBytes)`, whose status must be `ok` and whose `success` may be false. They must not go through mandatory-success `definition()` or through an ordinary source/check. Setup `loadDefinition` calls still require true success. Both use the actual Frontend.loadDefinitionFile transaction with `@test`, not a parser-only substitute, reconstructed graph, or expected data.

The required finite action family is direct definition + assertions, mandatory-success definition + assertions, and the existing source/check + assertions. It must support a definition-only case with no fabricated final `check("")`. Assertion dispatch runs immediately after its associated operation, before the next load/check/source can invalidate handles or change globals. #1388 can choose the final field names; these are the required typed facts:

- A direct result has `success:boolean`, `parseErrors: NativeParseDiagnostic[]`, `diagnostics: NativeDefinitionDiagnostic[]`, `modulePresent:boolean`, `sourceModuleName:string`, and `sourceHumanReadableName:string`. Parser begin/end and check begin/end are separate actual locations. Definition diagnostics currently have no `nativeIndex`; their array order is the native module error order. Do not cast them as a check result with an invented index. Adding explicit index serialization is optional for this scope because direct cases only use ordered array indices.
- A global-binding assertion selects the actual `linearSearchForBinding` result. Presence is a distinct predicate; documentation is its actual nullable binding symbol. A missing lookup is not proof that the definition failed, nor should any thrown exception be interpreted as absence.
- A global-type assertion selects actual `lookupType(name).type` and asserts presence, actual nullable type documentation, and the required structural kind. Existing globalAlias is sufficient for the type selection here; no fake TypeFun is needed.
- Own-property membership uses `props.count(name)==1`, not an unrelated total property count. Existing propertyNames + exact matching-key count and propertyFacts/read child cover it. Property documentation, readable presence, and function definition metadata remain distinct observations.
- Since native facts()/propertyFacts()/propertyNames() follow wrappers, raw `get`/`getMutable` assertions must additionally prove `identical(raw, follow(raw))` for extern/function positives, or use the existing rawTable predicate for the table positive. Documentation on the exact raw type is then attested by that identity before followed facts are read. A Bound control with the same followed kind but different raw identity must fail the raw predicate. This uses existing seams and does not request a new graph algorithm.
- Binding absence can currently be observed with `observe("binding_facts", context.session, context.revision, name)` and the exact native RequestError `Missing native global binding: NAME`. The dispatcher must recognize only this specific valid-context absence result. Unknown operations, stale/foreign handles, setup failures, and unsupported selectors must remain errors. An optional typed native binding lookup is acceptable, but a catch-all-to-absent wrapper is not.

## Exact definition action points

| Original case / location | Operations and executed new-solver predicates, in order |
| --- | --- |
| `load_definition_file_errors_do_not_pollute_global_scope`, definitions:80 | Fixture; direct load literal 0; success false; actual global binding foo absent; direct load literal 1 in SAME fixture; success false; actual global binding bar absent. First is a real parser failure, second a real checker failure. The original does not assert their diagnostic counts; separate controls retain actual parser count 2/no module and parser count 0/module present/TypeMismatch observations. |
| `class_definitions_cannot_overload_non_function`, :152 | Fixture; direct load; success false; parseErrors count 0; module present; errors count 2; error 0 GenericError with `Cannot overload read type of non-function extern type member 'X'`; error 1 GenericError with `Cannot overload write type of non-function extern type member 'X'`. Old-solver one-error text is provenance only. |
| `class_definitions_cannot_extend_non_class`, :192 | Fixture; direct load; success false; parseErrors count 0; module present; exactly one GenericError; message `Cannot use non-class type 'NotAClass' as a superclass of class 'Foo'`. |
| `no_cyclic_defined_extern_types`, :218 | Fixture; direct load; success false. Do not invent error count/kind assertions. |
| `definitions_documentation_symbols`, :317 | Fixture; mandatory-success load; x binding present/doc `@test/global/x`; Foo TypeFun present/type doc `@test/globaltype/Foo`; Bar TypeFun present/type doc `@test/globaltype/Bar`; raw Bar ExternType; own key prop count 1/property doc `@test/globaltype/Bar.prop`; y binding present/doc `@test/global/y`; raw y TableType; own key x count 1/property doc `@test/global/y.x`. |
| `definitions_symbols_are_generated_for_recursively_referenced_types`, :361 | Fixture; mandatory-success load; MyClass TypeFun present/type doc `@test/globaltype/MyClass`; raw ExternType; own myMethod count 1; property doc `@test/globaltype/MyClass.myMethod`; readTy present; raw FunctionType; definition present; actual definition module `@test`; actual begin/end [2,12,2,35]; vararg absent; actual original name [2,21,2,29]. A separate control proves raw first argument TypeId equals MyClass without recursive expansion. |
| `documentation_symbols_dont_attach_to_persistent_types`, :393 | Fixture; mandatory-success load; Evil TypeFun present; raw type documentation null. Separate control proves raw builtin string identity, not printed equality or a clone. |
| `class_definition_malformed_string`, :463 | Fixture; mandatory load helper returns actual false result despite upstream helper's logged REQUIRE; original explicit success false; exactly one parse error; actual message `String literal contains malformed escape sequence or \0`. Source contains literal backslash-zero, not embedded NUL. Separate pinned control checks begin/end [2,12,2,13]. Treat as explicit direct-failure operation in dispatch, rather than abort before the original assertions. |
| `definition_file_has_source_module_name_set`, :537 | Fixture; mandatory-success load; success true; actual SourceModule.name `@test`; actual SourceModule.humanReadableName `@test`; Foo TypeFun present; raw ExternType; its actual ExternType.definitionModuleName `@test`. Load source labels or function definition module cannot substitute for the last field. |

Additional negative controls: wrong documentation string does not match; nonexistent own property rejects; wrong function location does not match; non-class builtin has different raw identity; stale context after a second load rejects; fresh fixture lacks former globals; no generic error can satisfy an absent binding; parser/check failure diagnostics stay distinct. These controls do not change the original source, original expected data, or number/order of original operations.

## Genuine missing native observation

Pinned `Analysis/include/Luau/Type.h:581` declares `ExternType.definitionModuleName` as actual ModuleName. Current native `Session::facts` at session.cpp:927 records extern kind/props only; bridge facts serialization and TypeFacts have no extern definition module field. Required definitions:537 therefore cannot pass honestly.

Requested bounded typed shape: `TypeFacts.definitionModuleName: string | null`, serialized from the real ExternType field for an extern and null for non-extern. It must not be copied from load input/package or function definition metadata. Native raw-kind/identity checks precede this observation for the original raw ExternType requirement. #1388 owns any necessary session.h/session.cpp/bridge.cpp/host updates and rebuild. Private probe includes the required equality now; missing observation must produce a real test failure, not an omission or expected-value synthesis.

## Exact logical arena count

Original metatableOOP:146 `inferring_hundreds_of_self_calls_should_not_suffocate_memory`: Fixture; exact one raw source with 18 `:lower()` calls; one MainModule check; getMainModule; assert `internalTypes->types.size() <= 80` in the new-solver branch. The original does not assert result.errors. Old-solver <=50 is retained only as provenance.

Existing moduleFacts.internalNodes is the exact native `types.size()` observation. Shared assertion dispatch needs a named module and maximum node count at that check's operation point. It must reject unavailable/discarded graphs; zero after graph discard cannot satisfy the bound. Controls use a separate genuine >80 graph and reject node-count access after retainFullTypeGraphs=false. No C++ allocated bytes, JS arrays, or synthetic recorded count are equivalent.

## Exact body solver override

Original externTypes:933 `ice_while_checking_script_due_to_scopes_not_being_solver_agnostic`:

1. Construct the original ExternTypeFixture lazily, under the ordinary new-solver baseline.
2. Enter case-body ScopedFastFlag DebugLuauForceOldSolver=true.
3. At that operation point, call getFrontend().setLuauSolverMode(New). getFrontend initializes the native extern environment under the body flag, then explicitly overrides its mode.
4. Check the exact ExitSeat literal once, require errors. Keep all errors rather than asserting an invented count/kind.

Current ExternExplicitNewFixture constructs an ExternFixture but forces getFrontend/New during constructor initialize(); it is not the original timing above. Mapping the original fixture label to that preset and queuing the flag afterwards would be an unfaithful setup. Queuing it as initialization flags also changes original constructor timing.

Requested bounded shared operation: an explicit case-body `setSolverMode("New")` (names negotiable) for the audited original ExternTypeFixture route. It should invoke actual getFrontend().setLuauSolverMode(New) under queued case flags and retain the SAME fixture. Raw old flag remains true during operations. Existing check guard should admit this explicit attested mode transition and actual effective New mode, while ordinary old=true without it rejects. No general support for the old solver or arbitrary unknown override is requested. create/reset clears the override's session lifetime.

Dispatch preserves original fixture metadata `ExternTypeFixture`, explicit body override metadata, and raw flag independently. Required controls: effectiveFlags includes actual old=true; moduleFacts.checkedInNewSolver and effectiveNewSolver true; baseline flag restoration after operation/case; old=true/no override rejects; wrong/unsupported override rejects; recreated fixture does not inherit old allowance. This route has not been executed in the first definition probe.

## Precise per-module documented class parse-only contract

Actual accepted heading is the exact string “No `class` declarations”, from DIVERGENCES.md:526. It excludes actual source class declarations. Ordinary synthetic/declared extern fixtures, an unsupported selector/fixture, generic require failures, or pending if-local/value-export syntax are not class exclusions.

Bounded proposed metadata is a named dependency classification map, distinct from the entry's current `unparsed`:

```ts
moduleDivergences: { "game/A": { divergence: "No `class` declarations" } }
```

Each key must identify an actually registered dependency, not the entry, a missing module, or a guessed filename. Classification validates the exact existing documented heading, parses each exact source separately, labels observations with its actual module identity, requires classified game/A to reject, and requires every other module to be clean or separately justified by an existing independent issue record. A newly clean classified module must fail with remove-classification feedback. Unclassified setup errors fail.

For a graph with an accepted class dependency, parse-only selection must happen before native fixture construction/flag or semantic setup. It still verifies entry and ALL dependency syntax and preserves original fixture/flags/assertions as provenance; it does not invoke an invented extra check(A), replace B with a trivial clean source, or try an unsupported fixture and catch the error as a skip. Semantic assertions are ineligible because the graph contains documented excluded author syntax. Applicable graphs still require real native fixture support.

| Original | Metadata and exact lifecycle retained |
| --- | --- |
| classes:418 `isinstance_refines_imported_class` | ClassesFixture; LuauExportValueSyntax=true, LuauExportValueTypecheck=true; register game/A export-class Point and game/B require/class.isinstance; exactly one explicit check game/B; no errors and Point at B[5,22] remain provenance. Only A's class syntax receives the documented exclusion. |
| modules:1355 `export_class` | BuiltinsFixture; LuauExportValueSyntax=true, LuauExportValueTypecheck=true, DebugLuauForceOldSolver=false, DebugLuauUserDefinedClasses=true; register exact game/A and game/B; one check B; no errors, B.x number, B.y number remain provenance. Class declaration in A is accepted exclusion; this does not decide general value-export eligibility. |
| modules:1389 `non_exported_class` | BuiltinsFixture; DebugLuauForceOldSolver=false, DebugLuauUserDefinedClasses=true; exact A class/return and B require; one check B; exact one UnknownSymbol/name A.Point/context Type remain provenance. Only A's actual class syntax is classified. |

Existing checkSyntaxOnly already parses entry and dependencies without native creation. Current runPortedCase rejects all setupSyntaxDiagnostics before entry `unparsed`, and runNativePortedCase only looks at entry `unparsed`; neither can express A-only classification. Required correction is named classification/eligibility/validation dispatch, not a permanent parser rule or a missing-fixture bypass. #879 remains an independent require-parser prerequisite: any actual B require error must remain labelled B and fail unless precisely recorded against its own defect. Never attribute B's failure to A's class exclusion.

Required controls: missing classification key rejects; misnamed module rejects; incorrect/nonexistent heading rejects; clean source under a class classification fails; removing an actual classification exposes A's setup diagnostics; an extra unclassified failing dependency fails; entry diagnostics remain on B; parse-only does not construct native fixtures or validate unsupported semantic setup; replacing class source with applicable clean source returns to real semantic execution and exposes unsupported fixture/setup honestly. No class-graph execution is included in the first probe.

## First admitted private probe and process state

Owned untracked file: `packages/sparkdown/src/tests/luau-conformance/definitionNativeActionProbe.test.ts` in the original #1379 worktree. It imports the frozen #1388 loader read-only, hashes five native inputs plus host loader/WASM/JS/original four staged files/two original source files before and after, records actual observations to private `native-action-probe.json`, and disposes its WASM fixture. It contains 10 bounded tests for the definitions, negative controls, and exact 18-call count; the missing extern field assertion is an honest expected current failure.

Intended admitted command: `node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/definitionNativeActionProbe.test.ts --wait 600`. No standalone bundler, direct Vitest, native build, install, filtered TS, or UI execution. Parent explicitly placed execution HOLD for the serial 898→911 quiet window. As of this checkpoint no probe process has started, no reservation is queued, and no test result is claimed. Parent must explicitly release the hold before the already approved single run.

Shared correction batch: ordered definition-only action/assert dispatch; actual extern module field; explicit body solver override with old-flag guard; module-qualified documented class parse-only eligibility and validation; docs/function/raw-identity/count assertion vocabulary using existing real seams. All original ports remain owned by their original writers. #1379 remains incomplete pending those shared contracts, integration, final checks/live evidence/publication/review gates.

## Admitted probe result — 2026-10-04

Parent fully released HOLD after both quiet series, final911 11:10:27.537 UTC. Exactly ONE admitted command ran through the named test-suite reservation, actual exit1: 9 PASS / 1 FAIL / zero skips / zero collection or setup failures. Vitest started 07:12:00 local; test runtime386ms, total Vitest1.16s. Required definitions:537 field assertion at private probe line231 received actual undefined rather than `@test`. It remains a capability failure; source labels themselves are actually `@test` and passed.

`native-action-probe.json` contains actual real transaction/metadata observations and all14 pre/post file hashes; preserved=true. Native five inputs, nativeFixture loader, WASM/JS, original four staged files, and both pinned source files are unchanged. The run disposed its native fixture. Fresh process census found ownNamedTestProcesses=0; machine reservation.json absent; no reservation remains queued by this writer. No native/shared edit, install, compiler/TS, extra bundler, UI, or second probe execution occurred.

Verified actual native outcomes: first :80 failure has two parser errors/no module/foo absent; second same-fixture failure has zero parser errors/module present/one TypeMismatch at [1,28,1,31]/bar absent. Ordered read/write GenericErrors, non-class inheritance error, and cyclic false success passed. All positive actual binding/type/property documentation strings passed, as did recursive function module/locations/no-vararg/self identity and persistent Evil builtin identity/null doc. Exact malformed backslash-zero source returned one actual parse diagnostic [2,12,2,13]. Raw/follow guards and Bound wrapper negative control passed. Exact18-call actual internalNodes=76, independent >80 control=502, discarded graph observation rejects. These observations supersede historical TS mismatches for this native tranche only; no corpus/production integrated activation claim.

Body solver override and per-module class eligibility remain source-audited, unexecuted shared-dispatch prerequisites. Parent/#1388 should consume the compact batch below before any shared edit; original port writers retain their records.
