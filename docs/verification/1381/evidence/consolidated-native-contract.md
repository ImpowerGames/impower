# #1381 consolidated remaining native contract — source-only, INCOMPLETE

Same original gpt-6.1-sol/high writer, actual turn_context2026-10-04T18:06:29.767Z, matching previously verified Task/organization High. Parent admitted next-five authorship and one consolidated source audit only. No shared/native/legacy edits or test/build/TS/install/reviewer execution. d747 and frozen39 remain inputs. Historical ten staged files and prior three-case portable/private sources are preserved.

## Next five acceptance sources are prepared

Own worktree: `C:/Users/Lovelle/.codex/worktrees/nonstrict-fixture-support/impower`. Two NEW UNTRACKED files under `packages/sparkdown/src/tests/luau-conformance`:

| File | SHA256 |
| --- | --- |
| nativeFixtureConfigurationAcceptance.test.ts | 91c449c5677bd1d3de9da7afe0a0d7ffd2e8d68e0e6bec33dd38e6c843f1ea10 |
| nativeFixtureConfigurationAcceptance.private.test.ts | 7f3b663a303c97415f7caa082948da60832dea0df2c1243a7b7b2fdfea65ed4e |

Portable test uses relative `./typecheck/portedCases`. Private adapter redirects exactly that import to frozen #1388's actual dedicated worktree module, then imports the portable file unchanged; no native/check/query/assertion replacement. Private adapter must NEVER be staged/published. `next-five-inputs.json` SHA25624d33450fc1261685a6dff1ffca8c9cb3a8ca5e49aea4d06922662b89c1f2736 records64 frozen inputs (old61 plus new2 files and NonstrictMode.cpp), all matched after preparation and readback18:28:03.8776229Z. The old61 receipt and original-three sources remain immutable. Future adapter beforeAll/afterAll enforce64 hashes; they have not run.

`next-five-source-audit.json` directly compared TS literal bodies to pinned raw C++ literals after phase-one CRLF→LF, and verified the exact250-block generation expression. This is source fidelity, not runtime/TS validation:

| Original | Exact source bytes / SHA256 |
| --- | --- |
| nonstrict_shouldnt_warn_on_valid_buffer_use | 75 / 0019a7442b9d5770ac1cc6ee9e891c86dded56ca3b1043bebff0484716c0ea9d |
| additive buffer definition | 201 / 020549b4f6d1830ef53190e57561bcce262238b5f87a9d7ae6c4f77ae766c142 |
| nonstrict_check_block_recursion_limit | 1761 / c975c606c246524d5db13bca53f7e283cb33799b5941b9f29ed413f0ca507b20 |
| standalone_constraint_solving_incomplete_is_hidden_nonstrict | 103 / 7a2e35405d0967e5ad47e7ba28b902a15ac0469f32803fb2510821ecbe4c0b60 |
| non_standalone_constraint_solving_incomplete_is_hidden_nonstrict | 127 / d266a37ac99674886e62cccacb3c7ee15c86b3f4e279536caa1ea784aee1f7e5 |
| return_annotation_is_still_checked | 56 / 100f368995fe6960ad8286fb5f20e9392a12459bc7969cd0e7a6a455f3db355a |

Buffer uses existing PortedCheck.definitions, which loads its exact additive declaration BEFORE standard checkNonStrict definitions on the same fixture. Correction to earlier proposal: Fixture.cpp691–704 itself REQUIREs loadDefinition success, and shared definition actions reject empty expect arrays. No new unchecked/empty action is needed. Recursion carries actual250 blocks, counter true and150/750/750 FInts; the last FInt is genuinely unused by new solver, never given an invented effect. Magic cases preserve explicit DebugLuauForceOldSolver=false and original flags; the second adds no AlwaysShow flag. Return annotation preserves original ignoreMissingAnnotations, count1, then printed foo !=any, with no guessed signature.

Pending ONEfile command after parent grant:
`node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/nativeFixtureConfigurationAcceptance.private.test.ts --wait 900`
Expected5 original tests, zero skips. Not started; no new runtime count. Direct portable run/filtered TS waits shared release/base integration.

## Complete bounded remaining scope census

Read #598's full support audit/latest progress,197-case drafts, updated27-pending-case audit and authoritative eight early returns. Independently scanned the pinned three CPP files for fixture registration, definition loading, flags/FInts, named sources/sourceTypes, mode transitions, filtering and special selectors. The unresolved audit categories are first-position macros, explicit table state, already-proven captures/ICE/six data predicates, explicit Module source assignment and per-case builtin registration. Named-check protocol fidelity is an additional source-confirmed gap in the current wrapper. This is a census of #1381's bounded support domain, not a fresh full197-case execution/transcription audit, which remains #598-owned.

One coherent implementation request has FOUR domains. Two only need shared TS wiring over native APIs; two need finite native fixture operations/exports, with no checker algorithm changes:

| Domain | Existing native APIs | New requirement |
| --- | --- | --- |
| First begin-position diagnostic | firstErrorAt, ordered diagnostics.nativeIndex, errorFacts/errorType | Shared selector and result-bound callback only |
| Raw TableType state | facts.rawTable, tableState | Shared bounded state predicate/getter and enum mapping only |
| In-place NonStrict builtin registration | Actual pinned getFrontend/registerBuiltinGlobals/registerTestTypes functions | One Session recipe + bridge/NativeFixture action, preserving same arenas |
| Named Frontend check | Pinned Frontend::check and existing source/definition functions | Named operation preserving current config; NonStrict variant loads exact definitions/forces new within that operation |

## First begin-position selector: exact order and ownership

Pinned NonStrict macros27–64 scan result.errors from index0, stop at FIRST equal begin, REQUIRE found, REQUIRE get<variant>, then CHECK one scalar field. They do not search for a matching kind after finding a position, compare printed errors, or require an unasserted end position.

`remaining-first-begin-census.json` is independently extracted from pinned CPP:21 original cases/28 predicates. Every one uses the RAW native CheckResult.errors vector, no ignoreMissingAnnotations. It lists exact name/line/checkIndex/begin/kind/field/value. Only simple_negation_caching_example uses checkIndex1 (its second same-fixture check); others use checkIndex0. Separate existing annotations filters in require-mode transitions do not apply to these macros.

Minimal proposed shared descriptor:
`{ errorAtBegin: [line,column], code: "CheckedFunctionCallError" }`, followed by
`{ errorAtBegin: [line,column], fields: { checkedFunctionName: exactName } }`.
For function_def_sequencing_errors use NonStrictFunctionDefinitionError then argument x. Split descriptors preserve variant-before-field order. Selector validation requires exactly two nonnegative integers and exclusivity with ordinal error; unsupported keys/mixed selectors reject before native load. Existing code/field queries remain the actual native selected diagnostic.

For these raw originals, invoke fixture.firstErrorAt(result,line,column), yielding the actual nativeIndex; resolve the original result-bound wrapper for exactly that index, not a guessed filtered ordinal. Equal-position errors MUST retain the first native index even if its variant fails; never advance to a later convenient error. Verify missing match, wrong kind, stale/foreign result/index and tie order. Any tie control must use an actual native diagnostic vector, not a fabricated/reordered array or assumed source outcome.

If an original later deliberately calls ignoreMissingAnnotations, selection operates on THAT filtered sequence only, preserving surviving native-index order and provenance. Never apply a global annotation filter. Current raw firstErrorAt must not select a pruned first error: a result-bound host callback may scan the selected native scalar wrappers in preserved order, then query/validate errorFacts at the selected wrapper's original nativeIndex on the same result. It must reject foreign/reordered wrappers. No new C++ first-match algorithm is needed for the present21 raw originals; do not add a new filtered C++ ABI without an actual requirement. The selected wrapper's current result/revision and actual begin must be revalidated before facts are consumed.

## TableState predicate: raw table and actual enum

Original builtin_tables_sealed, builtins201: exact29-byte bit32 source (`55bb065632f1e02c50ac1159e9f602b03cf8017b1fa3d54784ef321b65d4a81a`), require b exists, get<TableType>(b) nonnull, then Sealed. No zero-errors macro appears; do not add one.

Propose `{ type: "b", tableState: "Sealed" }` with a native getter that FIRST requires facts.rawTable=true on the selected raw TypeId, then calls fixture.tableState. Existing kind predicates follow; a followed printed/table kind alone can wrongly accept a raw Bound wrapper and cannot replace this REQUIRE. Preserve presence→raw-table guard→state order within the descriptor. Pack/non-table/Bound values fail; nullable state cannot pass. Explicit selector path follow may be used only where a different original actually follows first.

Pinned Type.h404 mapping is Sealed0, Unsealed1, Free2, Generic3. Shared public names must map only to those actual native numeric values; unknown enums/states reject. Strictly validate the finite names, with no printed-shape deduction. Existing native tableState follows internally, but the prior rawTable guard preserves this original direct-get requirement. No native change/build is required for this domain. global_singleton_types_are_sealed has only filtered zero-errors assertions and is not a substitute for this explicit state case.

## Exact in-place builtin registration operation

Original NonStrict672 (first unfreeze674), nonstrict_method_calls. Exact54-byte check source SHA1210df7801dd7ec30317852ceef2e278d9b1cfbae1e5a8aa023a3d4d44e0018a:
`\n        local test = "test"\n        test:lower()\n    `.

Finite proposed action `{ nonstrictBuiltinGlobals: true }`, once before the check on the SAME fresh NonStrictTypeCheckerFixture:
1. Call that fixture's real getFrontend, lazily performing its hidden/test setup.
2. Unfreeze normal globals.globalTypes, then globalsForAutocomplete.globalTypes.
3. Call real registerBuiltinGlobals(frontend,frontend.globals), then that fixture's registerTestTypes (game/workspace/script real builtin any and @luau provenance).
4. Freeze normal then autocomplete arenas, exactly as upstream.
5. Later ordinary checkNonStrict loads exact standard definitions and checks the exact source; original sole assertion is zero errors.

No preset replacement, reconstruction/reset, builtin source approximation, copied globals or default behavior change. Add one bounded Session method, C ABI export and NativeFixture method, then shared finite action dispatch. Reuse pinned actual registration code; do not extend native algorithms. Require NonStrict preset, once, before source/definition/check or other incompatible setup; reject wrong preset, duplicate/late/unknown action instead of silently resetting. Maintain same frontend/global arena/builtin identities and case-scoped flags. Finally/refreeze or session teardown on native exception must preserve host lifecycle safety. Full recipe readiness must be tracked separately from zero-errors outcome. Current presets/API do NOT expose this operation; BuiltinsFixture is not an equivalent replacement.

## Exact named operation and SourceCode::Module

Original NonStrict81–88 checkNonStrictModule forces new, loads exact standard definitions successfully EVERY call, then returns getFrontend().check(moduleName) without changing defaultConfig.mode. Current Session::checkNonStrict instead calls check(module,Nonstrict), which changes the default configuration. B's explicit --!nonstrict makes the representative outcome look equivalent, but the protocol/current-default side effect differs. Preserve current config, including after any previous operation, rather than force Nonstrict/Strict to imitate a result.

Minimal shared modifier `entrypoint: "module"` plus required named module; reject mode overrides on this protocol. Native fixture should expose a named check operation retaining current configuration. Its NonStrict variant scopes force-new and loads standard definitions before direct Frontend::check; ordinary variants directly check under current configuration. Neither performs an invented source check, reset, config assignment or extra dependency check. Native host result/revision bookkeeping and actual case flags still apply. This can be one finite named ABI family; #1388 chooses bounded factoring, not a native solver extension.

Two original consumers:
- non_strict_shouldnt_warn_on_require_module635: install exact Modules/A (strict,64 bytes f75c...37d) and Modules/B (nonstrict,49 bytes7f5a...c8e8), A explicitly SourceCode::Module; named NonStrict check B only, zero errors.
- table_clone_should_support_variadic_any_in_old_solver1341: BuiltinsFixture; install game/A nonstrict and game/B without directive, named direct check B only; count0 on new solver despite name. Do not misclassify old-only.

NativeFixture.source already accepts module/script/none and defaults to module. Pinned TestFileResolver::readSource166–180 also defaults to Module; no original in these three files sets Script/None. Thus actual required Module source value already exists; no new native source-type implementation is needed. Preserve the explicit A type in source provenance or the supported third source argument. Dependency/directive bytes remain unchanged. #598's draft census includes entry in complete moduleSources; shared API rejects that duplication. Final #598 transcription must keep entry source once and dependencies-only moduleSources, preserving bytes. Named NonStrict draft's derived mode=nonstrict must become the actual named protocol, not an invented default change. These are port migration corrections, not permission to weaken shared validation.

Original require-source shared eligibility is still blocked by #879 (including #1384's actual802 failure before native initialization). Do not bypass, rewrite require, waive eligibility or claim integrated named acceptance from raw results. New named protocol can be verified as raw fixture behavior while exact integrated cases retain that dependency.

## Other requirements are existing APIs or acceptance gates

- NonStrict native lazy frontend currently calls actual registerHiddenTypes/registerTestTypes; exact1061-byte standard declarations load before each ordinary check via checkNonStrict. Same-fixture simple_negation_caching_example still needs original acceptance with exact second literal's tabs/spaces and repeated declarations. Native wrapper preserves a case-wide instance; no need a second fixture lifecycle implementation.
- Builtins dynamic/unknown-require cases780/807 have two SAME-fixture checks, Nonstrict→Strict, explicit force-new false; dynamic case filters missing annotations after EACH check, unknown case does not. Existing ordinary mode/check/clear flags support those transitions; acceptance is blocked by #879, not a missing native algorithm.
- Actual checkedFunctionName/argument fields, UnknownSymbol numeric context→Binding/Type mapping, typed get variants, diagnosticType builtin identity, module return PACK/printed inequality and ordinary enum fields already have native shared routes. inconsistent_module_return_types_are_ok uses modulePack and pack printing, not a fabricated scalar type; full original acceptance still required, no new query ABI proposed.
- Captures/levels, genuine native ICE and all6 structural data predicates have this writer's actual3 GREEN through immutable d747 private host. They stay distinct from TypeId identity/printed equality and from released portable/public AST integration. No general all-error comparator claim.
- Per-case flags/FInts use actual registry/scoped restoration; defaults/FrontendOptions remain pinned. No per-case FrontendOptions changes exist in this bounded corpus. Genuine magic type behavior is official native code, not TS-manufactured responses. Disabled expr recursion, eight audited old-only early returns, upstream guards and documented user-class divergence keep exact provenance. Grammar1382/876/879 and pending syntax decisions remain their own owners; applicable missing support never becomes permanent skip.

Remaining-domain inventory is complete for this bounded source assessment; future actual failures may reveal implementation defects, not permission to invent another expected seam. #1388 owns shared/native implementation/review/release. #598 owns full197 transcription and area owners own activation. #1381 remains INCOMPLETE: next5 unstarted, first-selector/state/registration/named acceptance unresolved, portable/public integration/CI/live/review pending. No further execution grant inferred; yield SAME writer process-free after packet delivery.
