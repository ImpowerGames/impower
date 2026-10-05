# #1363 completed static semantic audit — INCOMPLETE activation

SAME writer /root/ticket_1363. Latest own rollout turn_context in rollout-2026-10-04T01-03-16-01a1054b-7f9b-7301-abd0-287e631831ba.jsonl, turn_id 01a1056c-bf6f-75c0-a71f-03ad12f0b7f6, attests gpt-6.1-sol/high. Fresh REST issue #1363 confirms Task, Effort field 20063482/value 35105687 = High. Pinned source HEAD is 7d5f73364fdbbaa984fa545071630eba73cfea98. Authoritative architecture remains official checker+VM WASM.

This supersedes the initial semantic-handoff.md's unfinished audit, old 767 count and unresolved empty-body classification. Static source/assertion/setup audit is now complete for the current staged #594 corpus, with the concrete remaining port and adapter gaps below. It does not establish native or integrated checker outcomes.

All own commands exited. No tests, native builds, install, browser, server, reviewer, worktree creation or repository edits were performed by this writer. All private scripts and handoffs were editor-written. #594's four staged ports, frozen #1368 head 8a468a74070b2b8c94dbda624b30110533dfe769, #1388 adapter and main were only read. No owned process/session remains. Release this slot for SAME #594 corrections; resume this writer for eventual activation.

## Durable mapping and counts

`audit.mjs` independently reads pinned C++ and the actual staged TypeScript AST literals. `semantic-audit.mjs` separately selects the active new-solver conditional text, resolves check-local query/error aliases, maps literal/field/location/presence/print/inequality/error-count macros to the actual per-check expectation objects and records unmatched/manual observations. It consults #594's boundary audit only for compiled/header/whole-case exclusions; all active branch assertion comparisons use this writer's own scanner. Upstream guard text, disabled regions and same-fixture sequences were also manually inspected.

- case-inventory.json: all 337 pinned bodies and corresponding staged cases, exact source/definition/support hashes and port line numbers.
- semantic-assertion-ledger.json: every case and every selected active macro, its semantic observation, check index and mapping status.
- semantic-follow-up.json: seven macro observations requiring native/manual handling, retained verbatim.
- semantic-setup-ledger.json: every case's exact fixture, scoped flags, modes, definitions, module support, filtering, sharing and parse provenance.
- semantic-summary.json: totals, manual observations, inactive names and sequences.
- activation-ledger.json: all 337 rows explicitly nativeActivation=not-run and integratedActivation=not-run.

| File | Cases | Check DATA records | Assertion DATA records |
| --- | --- | --- | --- |
| refinements | 166 | 168 | 372 |
| cfa | 42 | 42 | 129 |
| typestates | 48 | 48 | 120 |
| loops | 81 | 87 | 145 |
| Total | 337 | 345 | 766 |

The 345 records contain four empty compiled bodies, so they are not 345 executed snippets. All names occur exactly once; every source, definition and support string matches a literal in its own exact pinned case. Three definition sources and one support-module source are additional to the check DATA records. Fixtures match exactly: 83 Fixture, 204 BuiltinsFixture, 24 RefinementExternTypeFixture, 26 TypeStateFixture. No scoped flag/source/fixture mismatch was found.

320 cases are active under the selected new solver. 17 are upstream inactive: six whole-case NEW guards, four selected-new early returns, three #if0-disabled typestates headers and four entirely #if0-disabled compiled loop bodies. OLD guards remain active under New. Exact names/reasons/selected text are in the ledgers; no applicable missing fixture/query/parser case is classified as permanently inactive.

762 selected active macros were mapped: 755 match their staged semantic observation; the seven below were manually adjudicated. The remaining stored expectations all correspond to those manual observations or upstream-inactive provenance. Counts are static source audit evidence, never conformance passes. The earlier private audit script had one syntax error in its summary expression; it wrote no result then, was corrected, and the observed successful reruns produced the retained ledgers.

## Seven manual observations and exact SAME #594 corrections

| Pinned source | Manual observation | Disposition |
| --- | --- | --- |
| refinements694/717–719, free_type_is_equal_to_an_lvalue | New TypeArena and UnifierSharedState using frontend ICE; native New Normalizer normalizes actual type at(3,36), then typeFromNormal and default print equals string? | Staged normalized:true selector is faithful data. Native operation is currently missing; raw printing is not equivalent. |
| refinements2395/2397, long_disjunction_of_refinements_should_not_trip_recursion_counter | CHECK_NOTHROW(actual check of exact malformed source) | No-error expectation must not be invented. Native check must execute and not throw even though parsing produces errors; parse-only verification is insufficient. |
| refinements2435/2437, more_complex_long_disjunction_of_refinements_shouldnt_trip_ice | Same CHECK_NOTHROW requirement on its exact malformed source | Same actual-check requirement, with current malformed reason retained. |
| refinements2475/2477, refinements_should_avoid_building_up_big_intersect_families | CHECK_NOTHROW actual ordinary check, no diagnostic expectation | Empty expect is appropriate if the actual checker executes successfully; cannot replace it with parse-only coverage. |
| refinements2760/2785–2789, cannot_call_a_function_union | error1 message equals adjacent C++ strings concatenated with one escaped newline | Manually compared exact concatenation to staged one-string message; bytes/spacing/newline match. Existing #876 remains its temporary parser blocker. |
| loops442/459, for_in_loop_with_custom_iterator | builtin.numberType == tm->wantedType, direct native TypeId identity | Current printed fields:{wantedType:"number"} weakens the assertion. Replace through SAME #594 with diagnosticType:[0,"wantedType"], sameAs:{builtin:"number"}; native implementation must compare the original pointers, without adding follow. |
| loops442/460, same case | builtin.stringType == tm->givenType, direct native TypeId identity | Same correction using diagnosticType:[0,"givenType"], sameAs:{builtin:"string"}. Keep the required TypeMismatch presence and count. |

The analogous pointer assertions at loops378–379 occur in a whole-case NEW-guarded case; they are inactive upstream, not two additional active obligations. No active native structural TypeError equality exists in these files: loops894's constructed GenericError/Location equality sits in the wholly #if0-disabled loop_iter_metamethod_not_enough_returns body and stays full provenance. Printed type comparisons elsewhere remain printed comparisons; do not strengthen them into identity.

Three further SAME #594 corrections: add shareFixture:true to refinements oss_1835 (3 checks), loops unreachable_code_after_infinite_loop (5 checks), loops oss_1413 (3 checks). Fixture.cpp328–345 proves each Fixture::check forces/retains the same Frontend, replaces main source, markDirty(main), clearStats and checks the main again. The current ports have shareFixture=false by omission; the current released-shape #1368 runner recreates unless explicitly shared. Assertions must observe each result before the next source replacement invalidates it. Source/check order and all current expectations are otherwise preserved; no new clearFrontend/reset operation belongs between these checks.

Diagnostic identity selectors use the post-ignoreMissingAnnotations index that upstream checks. Maintain an explicit mapping to the original native diagnostic index when TypeAnnotationRequired is removed; never silently query native error0 if filtered error0 was originally error1. The existing TS query identity follows both operands generally, whereas these two upstream predicates do not explicitly follow. Native opaque raw TypeId identity is required for fidelity.

The parent and SAME #1388 were notified of all these requirements. SAME #594 was not messaged while slots were full; parent will resume it.

## Native #1388 requirements

1. Exact RefinementExternTypeFixture at refinements24–153, presently absent from #1388's Preset/synthetic API. It extends BuiltinsFixture, not ClassFixture. Install actual native Vector3 with numeric X/Y/Z and builtin.externType root; Instance with Name:string and IsA:(inst,string)->boolean carrying MagicInstanceIsA; ExternScriptConnection parent Instance and Disconnect:(self)->emptyTypePack; Folder and Part parent Instance, Part.Position Vector3; WeldConstraint parent Instance, Part0/Part1 union(part,nil). Export all six actual TypeFun bindings, persist every exported type, set effective New and freeze the arena. MagicInstanceIsA::refine validates one string argument/index/discriminant, scope-lookups the literal extern name, asserts actual BlockedType, then binds that discriminant to the actual native type. A plain definition or ordinary ExternTypeFixture does not reproduce it. There are 24 named cases using this fixture (including two upstream inactive), all individually recorded.
2. TypeStateFixture is precisely BuiltinsFixture plus lifetime DebugLuauForceOldSolver=false. A named alias to that native selected-New preset is sufficient only when the actual force-New scope and Builtins environment are preserved; no NonStrict substitution.
3. Native normalized type operation for refinements694 as above, preserving real native Normalizer and typeFromNormal with resource/absence failures surfaced. #1388 currently uses Normalizer only internally for subtype; no normalized-query ABI/host operation exists.
4. Existing mainType/positionType/native print/errorFacts/builtin/identical operations should satisfy this area's ordinary query vocabulary after harness mapping. Use native variant names, byte locations, default/exhaustive print and real field handles. UnknownProperty table prints, UnknownSymbol name/context, TypeMismatch wanted/given, CountMismatch expected/actual and GenericError message all match their active upstream semantics. Field context enums need faithful name mapping (Arg, Type), not message inference. TypeErrorData raw order is required; no case here sorts errors.
5. Restore and preserve the three exhaustive error-field options already corrected by SAME #594: typestates386 wantedType; typestates887 wantedType and888 givenType. Native field handles plus printedOptions/exhaustive are available, but their final shared corpus mapping remains unexecuted. The repeated err2/errors[0] and err3/errors[1] in fuzzer_table_freeze_in_binary_expr are intentional upstream indexes and remain unchanged.
6. Exact definitions before check: typestate_globals(Fixture:foo:string|number,f:(string)->()), oss_1561(Fixture:Vector3 extern plus Vector3.new optional numeric args), refinements_from_and_should_not_refine_to_never(Builtins:Config booleans). Definition load must actually install/check successfully; no swallowed setup failure. The source/module registration operation must register exact game/Foo support before a single game/Main check for if_local_visits_malformed_annotation_qualified; no independent support check added. That experimental case remains policy pending.
7. Explicit case flags must scope native initialization/setup/check/diagnostics/query/printing, retain effective readback and restore on success/failure. This area has no ScopedFastInt or custom limit setup. Luau-prefixed selected-New baseline plus actual case overrides is necessary. The 16 experimental records retain DebugLuauIfLocalSyntax=true and DebugLuauIfLocalAnalysis=true; human policy pending remains a gate for their integrated activation. No exclusion/syntax approval inferred.
8. Preserve nonstrict overrides in cli_181549_refined_string_should_be_subtype_of_string and restored loop_iter_no_indexer_nonstrict. Other check defaults are native strict, with real directive precedence. Preserve ignoreMissingAnnotations exactly as Fixture.cpp773 removes only TypeAnnotationRequired, retaining other diagnostic order, and preserve optional-type presence queries before printing.

## Categorized remaining acceptance

Static fidelity: five concrete port corrections remain (two native identity records and three shareFixture markers); rerun this static audit on SAME #594's correction and record actual schema/identity behavior. Shared schema final release is gated by #1368 review; this writer edited none of its frozen files.

Native fixture/query acceptance: #1388 must implement and verify exact RefinementExternTypeFixture and normalization, expose the faithful raw identity/filter mapping, and preserve no-throw malformed checks, definitions/flags/session semantics. Existing adapter sample passes do not activate this corpus. No native execution was attempted here.

Parser/policy: retain exact #1370/#1372/#876/#879 temporary provenance and the three upstream-malformed reasons; resolve applicable parser blockers through their owners before integrated activation. 16 experimental cases remain HUMAN DECISION PENDING. No new defect filed, no permanent missing-capability exemption.

Activation: #1363 still must create its own supported isolated worktree after parent releases #594/#1368/#1388/#1387, enable all four CHECKED_AREAS permanently under assigned shared ownership, establish meaningful red/green corrections, run only named files through the supported runner, filtered typecheck, actual integrated Sparkdown/native equivalence and representative warm/fresh edits, inspect required live/measured evidence and runtime invariance, publish draft PR and finish mandatory independent CLI reviews/CI. Native/integrated pass counts, PR and readiness are all not-run/absent. Do not claim the issue complete from this audit.
