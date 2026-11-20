# Authoritative new-solver path audit at Luau 7d5f733

The eight cases below have an unconditional TEST_CASE return in the selected branch of `if (!FFlag::DebugLuauForceOldSolver)` before any check/setup/assertion. With the new solver (`DebugLuauForceOldSolver = false`), that condition is true. No source or flag setup precedes these returns; only explanatory comments, where listed. Their Lua source remains verbatim for parse coverage, but their old-solver assertions are not ported.

| Case | Upstream lines | Provenance |
| --- | --- | --- |
| setmetatable_should_not_mutate_persisted_types | 571-588; condition573, return574 | No additional reason upstream |
| string_format_correctly_ordered_types | 620-636; condition623, return624 | CLI-115690 comment622 |
| select_way_out_of_range | 774-787; condition777, return778 | CLI-115720 comment776 |
| select_slightly_out_of_range | 789-802; condition792, return793 | CLI-115720 comment791 |
| select_with_variadic_typepack_tail_and_string_head | 823-844; condition826, return827 | CLI-115720 comment825 |
| dont_add_definitions_to_persistent_types | 1069-1095; condition1073, return1074 | Comment1071-1072: makes no sense with type states/new solver |
| assert_removes_falsy_types_even_from_type_pack_tail_but_only_for_the_first_type | 1144-1157; condition1146, return1147 | No additional reason upstream |
| assert_returns_false_and_string_iff_it_knows_the_first_argument_cannot_be_truthy | 1159-1177; condition1161, braced return1164 | CLI-114134 - egraph simplification comment1163 |

The separate upstream guards are sort_with_bad_predicate (header143, guard145) and set_metatable_needs_arguments (header1359, guard1362). These match the authoritative typecheck-cases.json doesNotPassNewSolver markers. They are compiled cases guarded from new-solver execution, distinct from #if0 bodies and the eight explicit early returns.

Positive control: pcall_returns_at_least_two_value_but_function_returns_nothing at679-694 has inverse `if (FFlag::DebugLuauForceOldSolver)` at682 followed by return683. On the new solver the condition is false, so source checking and all three observations execute: errors0, ok boolean, res unknown. It remains active. No C++ return statements exist in the other two upstream files.

The private generator's selected-path pre-check return detector is only a cross-check on this explicit audited set, not an independent proof of arbitrary C++ control flow. All selected pre-check returns match these eight exact cases, including the braced return. No lambdas or nested optional returns precede their checks. The inverse guard positive control is asserted in audit-prepared.mjs.

Reconciled case categories: Builtins122 =112 pending area +8 explicit old-only +2 guarded upstream. NonStrict54 =52 pending area +1 upstream #if0 disabled +1 existing user-class divergence. Nonstrict21 =19 pending area +2 guarded upstream. These counts describe the specification transcription, not successful checker activation or conformance passes.
