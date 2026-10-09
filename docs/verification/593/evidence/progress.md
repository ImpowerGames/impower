# #593 checkpoint

Phase: internal blocked checkpoint; source transcription/independent parse audit exhausted pending shared harness and grammar work. Resume this same writer after #1368 integration. No completion claim.

Worktree: C:/Users/Lovelle/Documents/GitHub/impower.worktrees/codex/test/593-function-type-pack-port. Base origin/main f4e632bc9. Install exited 0; repeated preflight all five PASS. Coordinator confirmed final cleanup exit0.

Ownership: new TypeInfer.functions.test.ts, TypeInfer.typePacks.test.ts and ticket-specific port/verification data only. Shared harness and README belong to #930.

Preflight from main and worktree: all five PASS. Coordinator completed guarded cleanup successfully before worktree creation; no concurrent cleanup was launched.

Ticket: REST confirms Task / High. Upstream pinned sources downloaded privately from luau-lang/luau@7d5f73364fdbbaa984fa545071630eba73cfea98. Scope 222 functions + 61 type packs, including 20 guarded new-solver cases.

Discovery: not-implemented acceptance criterion is stale after #599; current shared harness runs a real checker. No checker removal or artificial breakage planned.

Runner evidence: latest turn_context in rollout-2026-10-03T10-00-18-01a10210-cb1e-71d1-b644-3bf2382471e3.jsonl confirms gpt-6.1-sol / high. No PR, review or owned test/driver process.

Required harness capabilities from pinned upstream (no shared files edited):

- typePacks infer_multi_return (line 21), last_element_of_return_statement_can_itself_be_a_pack (65): function return head length, exact element builtin identities represented as printed builtin types, and explicit absent tail. return_type_should_be_empty_if_nothing_is_returned (111) and no_return_size_should_be_zero (126) check pack size, not just existing head array.
- typePacks type_alias_type_packs (301), second check: table instantiatedTypeParams and instantiatedTypePackParams each have length 1; element 0 type prints number/string/string and pack prints () / number / number, boolean for a/b/c. These are alias instantiation arguments, not declaration parameters.
- typePacks variadic_packs (203): upstream injects foo:(...number)->number and bar:(number,...string)->number through addGlobalBinding. Preserve snippet verbatim and fixture bindings as data; cannot mark this supported checker setup not applicable.
- typePacks function_return_count_mismatch_through_union_reports_expected_return_pack (1009): diagnostic[0] message must exclude "Expected to return" and include "is not a subtype of". Intersection sibling (1026) must include "Expected to return". Exact substring predicates needed.
- functions no_lossy_function_type (1243): typeAt [6,14] is FunctionType and hasSelf=true, in addition to exact printed signature.
- functions record_matching_overload (1268): resolved overload of call containing position [3,10] must print (number) -> number. AstQuery typeAt alone explicitly queries the wrong expression upstream; requires astOverloadResolvedTypes selector.
- functions generic_polarity_of_annotated_code (4294): f FunctionType generic index0 is GenericType with polarity Mixed. This is the case's only behavioral assertion, expressed through LUAU_ASSERT upstream.
- functions ExternTypeFixture cases bidirectional_inference_of_class_methods (2882) and bidirectional_function_statement_inference_with_extern (4024): require the real upstream class globals (ChildClass/BaseClass/connection and ClassWithGenericMethod), not a renamed bare Fixture.

Non-need correction: module-scope varargPack iteration in typePacks unifying_vararg_pack_with_fixed_length_pack_produces_fixed_length_pack (1076) is inside a disabled block comment upstream. Its disabled case marker suffices; no active harness request for this assertion.

Additional active queries from complete macro audit:

- functions vararg_function_is_quantified (230) queries module return[0] as TableType and property f existence: moduleReturn requires a path selector, not only print equality.
- functions infer_higher_order_function (716), higher_order_function_2 (746), higher_order_function_4 (815): argument pack head lengths 2 / 6 / 2; nested function argument head lengths 1 / 2. Existing argument paths and sameAs can express builtin/type identities once pack queries exist.
- functions bidirectional_checking_of_callback_property (2845): diagnostic0 beginning line6 and ending line8 (no column assertion). Need endLine as well as existing line.

These are the full active structural/fixture/API needs identified so far. Existing error fields can state CountMismatch.isVariadic=true, TypeMismatch fields, ExplicitFunctionAnnotationRecommended.recommendedReturn. Disabled tf_suggest_arg_type (2786) has recommendedArgs checks but needs no active query.

Important port decision: functions simple_unannotated_mutual_recursion (2672) returns before check on the new solver because assertions are unstable (CLI-117118). Preserve parse snippet, use explicit newSolver skip reason from upstream, no unstable old assertions.

Private deterministic transcription tools exist but generated output remains subject to per-case audit against upstream. No shared harness edits or PR/reviews; current processes all exited. These capabilities block faithful completion; no assertion is omitted or silently skipped.

## Latest checkpoint, 2026-10-03

The two owned port files are staged, uncommitted, and preserved in the worktree. 222 functions cases / 236 checks / 465 represented assertion objects; 61 typePack cases / 75 checks / 191 objects. Total 283 cases, 311 checks, 656 represented objects. 47 upstream predicates remain explicitly marked PENDING ASSERTION AUDIT (15 functions, 32 packs), plus separate pending fixture/module/flag/print setup notes. Nine initial pending ordinary predicates were resolved; 27 nested NO_ERRORS calls and LUAU_CHECK aliases are now represented. No placeholders are eligible for a completion PR.

Source fidelity: every runtime string equals an exact raw or ordinary C++ literal within its named pinned upstream case, independently checked by source-provenance.mjs (311 records, unmatched=[]). There are no dynamically built source expressions in these two files. Source runtime equality against the initial exact transcript passed after conversion to readable TS template strings. The two Mode loops are expanded to strict and nonstrict with identical source bytes. All 20 DOES_NOT_PASS_NEW_SOLVER_GUARD cases retain exact reason and old-only expectations are absent. Additional explicit new-solver early-return cases are simple_unannotated_mutual_recursion (unstable CLI-117118) and free_is_not_bound_to_unknown (upstream says old solver only). Disabled upstream cases keep disabled markers.

Exact parse evidence: source-audit-final.json / ported-checkpoint.log. 311 snippets, official parser rejects12, Sparkdown rejects43. Seven official rejects are feature-flag oracle limitations for LuauExportValueSyntax and are not classified malformed. The deliberately malformed missing-else fuzzers and missing pack default have accurate malformed records. function_calls_should_not_crash is native-malformed because of a statement after return; Sparkdown accepts it (#1298), upstream asserts nothing beyond no crash, so expect remains empty.

Known valid syntax blockers recorded: #876 prefix variadic/type packs; #879 require; #984 component expression keyword capture (oss_2125). New #1373 typed Bug / Effort Medium is verified and attached as a blocker by parent. Exact reduction `repeat until p() x = x` is official-valid/Sparkdown-invalid; newline control passes; semicolon fails. Added component rename-control evidence to #984 comment5970269152. Parent filed approved Feature #1374 High: allow line-leading intersections in function Luau bodies, remove redundant & statement marker there, retain story & end-of-line boundary. Exact graph-coloring source retained; it remains parse-red pending that feature, without divergence exclusion.

Final forced run (actual current checker, both named areas) exited1: 213 passed / 20 failed / 52 skipped, 285 tests. Logs: forced-checkpoint-final.log. Prior baseline after transcription was 10failed/2passed/274skipped on 286 tests including temporary audit; its one overbroad #876 record was corrected, leaving7 export parse failures,1 intersection parse failure and moduleReturn coverage failure. #930 moduleReturn support now merged on origin/main1337c7f4, but this worktree is still base f4e632bc9; integrate released shared changes on resume under parent coordination.

Forced results prove represented assertions invoke a real checker; they do not prove faithful completion while predicates/setup are pending. Confirmed corrected transcription differences: NotATable field is ty; explicit old-only free_is_not_bound_to_unknown skip; exhaustive named print opts. Remaining forced failures include moduleReturn schema, three hidden fun aliases, ExternTypeFixture, variadic typed globals, numeric LuauTarjanChildLimit=1 NotImplemented,7 export flag/wrapper cases, #1374, explicit exhaustive diagnostic-field print, cyclic_function_type_in_rets printer stack overflow, and oss_2623_double_negate_string errors3 vs0. Genuine checker gaps belong to #1362 after correct setup and full predicates are represented.

Additional exact setup/printing needs confirmed with #1368:
- registerHiddenTypes in function_is_supertype_of_concrete_functions2174, concrete_functions_are_not_supertypes_of_function2194, other_things_are_not_related_to_function2223: builtin fun alias (full hidden aliases may be implemented there).
- tf_suggest_arg_type_2 at2808 sets retainFullTypeGraphs=false for cloned module-interface errors.
- function_decl_non_self_sealed_overwrite at1721 shares builtin fixture then frontend.clear() between checks, preserving string.len mutation across cleared modules. Earlier message incorrectly attributed clear to function_decl_quantify_right_type; corrected.
- calling_function_with_anytypepack_doesnt_leak_free_types at1066: exhaustive=true plus maxTableLength=0 (unlimited).
- param_1_and_2_both_takes_the_same_generic_but_their_arguments_are_incompatible2344: diagnostic0.givenType printed with explicit exhaustive=true, not default alias print.
- c.flags currently recorded but never passed/applied by runPortedCase. Preserve flag data; no false oracle-validity claims or relaxed flag-dependent expectations.

#1368 canonical proposed integration vocabulary: arguments/returns {length,tail}; generic / instantiatedTypeParameter / instantiatedTypePackParameter path steps; hasSelf; polarity; overloadAt; importedAlias; globals map; hiddenTypes; retainFullTypeGraphs; shareFixture + clearModules; maxTableLength print option; diagnostic fieldOptions. Its builtin selector permits real sameAs builtin identity comparisons, which should replace conventionally printed builtin comparisons where C++ compares TypeIds. Await implementation/tests before applying these shapes.

Verification artifacts and original scratch tests are retained privately alongside this progress.md. All three scratch test files were removed from the worktree using editor patches; no tests/reviewers/drivers remain alive. git staged diff check is the final check after EOF whitespace correction. No shared files edited, no PR, no reviews, no CI run, no reviewed commit. Parent will resume this same agent for faithful #1368 integration, complete conditional/predicate audit, scoped typecheck/live verification, draft PR, serial fidelity-first and undirected-last independent reviews through reservation launcher (six-round delegated cap). Parent alone merges.
